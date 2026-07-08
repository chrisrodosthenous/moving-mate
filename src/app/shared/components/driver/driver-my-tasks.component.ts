import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, NgClass } from '@angular/common';
import { Store } from '@ngrx/store';
import { BreakpointObserver } from '@angular/cdk/layout';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { TransportOrder, ORDERS_API_BASE } from '../../../core/services/orders.service';
import { AuthStore } from '../../../store/auth.store';
import { CargoPhotoLightboxComponent } from '../cargo-photo-lightbox/cargo-photo-lightbox.component';
import { ChatSideDrawerComponent } from '../chat-side-drawer/chat-side-drawer.component';
import { OrderRoutePreviewDialogComponent } from '../order-route-preview-dialog/order-route-preview-dialog.component';
import { ChatService } from '../../../core/services/chat.service';
import { LoggerService } from '../../../core/services/logger.service';
import * as DriverActions from '../../../features/driver/state/driver.actions';
import {
  selectDriverActiveTrips,
  selectDriverActiveTripsHasMore,
  selectDriverActiveTripsLoading,
  selectDriverActiveTripsLoadingMore,
  selectDriverCompletedTrips,
  selectDriverCompletedTripsHasMore,
  selectDriverCompletedTripsLoading,
  selectDriverCompletedTripsLoadingMore,
  selectDriverCompletedTripsTotal,
  selectDriverMyError,
  selectDriverTripBusyId,
  selectDriverTripStatusError,
} from '../../../features/driver/state/driver.selectors';
import { customerOrderListStagger } from '../customer/customer-animations';
import { orderStatusToBadgeVariant } from '../../utils/order-tracking';
import { normalizeOrderId, orderSubmissionDateIso } from '../../utils/order-utils';
import { UiButtonComponent } from '@/components/ui/button';
import { DriverJobCardComponent } from './driver-job-card/driver-job-card.component';
import { DRIVER_JOB_CTA_CLASS } from './driver-job-card/driver-job-card.theme';

const POLL_MS = 10_000;
const CHAT_UNREAD_POLL_MS = 5000;

import {
  ROUTE_PREVIEW_SPLIT_BREAKPOINT,
  routePreviewSplitInitial,
} from '../../constants/viewport-breakpoints';

/** In-flight work (extends `accepted` + `picked_up` with canonical en-route labels). */
const DRIVER_ACTIVE_TRIP_STATUSES = new Set([
  'accepted',
  'picked_up',
  'in_progress',
  'driver_is_on_the_way',
  'delivery_in_progress',
]);

/** Terminal / withdrawn; `delivered` and `completed` both appear in legacy APIs. */
const DRIVER_COMPLETED_TRIP_STATUSES = new Set(['delivered', 'completed', 'cancelled']);

function driverCustomerName(order: TransportOrder): string {
  const c = order.customerId;
  if (!c || typeof c !== 'object') return '—';
  const parts = [c.firstName, c.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  if (c.name) return c.name;
  return '—';
}

function driverDisplayStatus(status: string): string {
  if (status === 'picked_up' || status === 'driver_is_on_the_way') return 'In progress';
  if (status === 'in_progress') return 'In progress';
  if (status === 'delivered' || status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'accepted') return 'Accepted';
  return status || '—';
}

/** Statuses where route preview is emphasized (aligned with customer My Orders View Route). */
const DRIVER_ROUTE_PREVIEW_PROMINENT_STATUSES = new Set<string>([
  'accepted',
  'picked_up',
  'in_progress',
  'driver_is_on_the_way',
  'delivery_in_progress',
]);

@Component({
  selector: 'app-driver-my-tasks',
  standalone: true,
  imports: [
    DatePipe,
    NgClass,
    CargoPhotoLightboxComponent,
    ChatSideDrawerComponent,
    UiButtonComponent,
    DriverJobCardComponent,
    OrderRoutePreviewDialogComponent,
  ],
  templateUrl: './driver-my-tasks.component.html',
  styleUrl: './driver-my-tasks.component.css',
  animations: [customerOrderListStagger],
})
export class DriverMyTasksComponent {
  readonly tripPrimaryBtnClass = DRIVER_JOB_CTA_CLASS;

  private readonly store = inject(Store);
  private readonly auth = inject(AuthStore);
  private readonly logger = inject(LoggerService);
  readonly chatService = inject(ChatService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  readonly isRoutePreviewSplitUp = toSignal(
    this.breakpointObserver.observe(ROUTE_PREVIEW_SPLIT_BREAKPOINT).pipe(map((r) => r.matches)),
    { initialValue: routePreviewSplitInitial() },
  );
  readonly orderStatusToBadgeVariant = orderStatusToBadgeVariant;

  readonly submissionDateIso = orderSubmissionDateIso;

  readonly activeTripsList = toSignal(this.store.select(selectDriverActiveTrips), { initialValue: [] });
  readonly completedTripsList = toSignal(this.store.select(selectDriverCompletedTrips), { initialValue: [] });
  readonly loading = toSignal(this.store.select(selectDriverActiveTripsLoading), { initialValue: false });
  readonly completedTabLoading = toSignal(this.store.select(selectDriverCompletedTripsLoading), {
    initialValue: false,
  });
  readonly activeTripsHasMore = toSignal(this.store.select(selectDriverActiveTripsHasMore), {
    initialValue: false,
  });
  readonly completedTripsHasMore = toSignal(this.store.select(selectDriverCompletedTripsHasMore), {
    initialValue: false,
  });
  readonly activeTripsLoadingMore = toSignal(this.store.select(selectDriverActiveTripsLoadingMore), {
    initialValue: false,
  });
  readonly completedTripsLoadingMore = toSignal(this.store.select(selectDriverCompletedTripsLoadingMore), {
    initialValue: false,
  });
  readonly completedTripsTotal = toSignal(this.store.select(selectDriverCompletedTripsTotal), {
    initialValue: null,
  });
  readonly error = toSignal(this.store.select(selectDriverMyError), { initialValue: null });
  readonly tripBusyId = toSignal(this.store.select(selectDriverTripBusyId), { initialValue: null });
  readonly tripStatusError = toSignal(this.store.select(selectDriverTripStatusError), {
    initialValue: null,
  });

  readonly userId = computed(() => this.auth.user()?.id ?? '');

  /** Tabs: `'active'` is default so in-flight jobs render first after load. */
  readonly activeTab = signal<'active' | 'completed'>('active');

  /** Admin rejected license: hide active deliveries; completed list remains. */
  readonly driverVerificationRejected = this.auth.isDriverVerificationRejected;

  readonly cargoLightboxUrl = signal<string | null>(null);
  readonly routePreviewOrder = signal<TransportOrder | null>(null);

  /** Store-merged order for the route drawer (silent refresh updates driver location / status). */
  readonly routePreviewOrderLive = computed(() => {
    const pinned = this.routePreviewOrder();
    if (!pinned) return null;
    const id = String(pinned._id);
    return (
      this.activeTripsList().find((o) => String(o._id) === id) ??
      this.completedTripsList().find((o) => String(o._id) === id) ??
      pinned
    );
  });

  readonly activeTrips = computed(() => this.filterActiveTrips(this.activeTripsList()));

  readonly completedTrips = computed(() => this.filterCompletedTrips(this.completedTripsList()));

  readonly activeStaggerKey = computed(() => this.activeTrips().map((o) => o._id).join(','));
  readonly completedStaggerKey = computed(() => this.completedTrips().map((o) => o._id).join(','));

  selectTripsTab(tab: 'active' | 'completed'): void {
    this.activeTab.set(tab);
    if (
      tab === 'completed' &&
      this.completedTripsTotal() === null &&
      !this.completedTabLoading()
    ) {
      this.store.dispatch(DriverActions.loadDriverCompletedTrips());
    }
  }

  readonly loadMoreVisible = computed(() =>
    this.activeTab() === 'completed' ? this.completedTripsHasMore() : this.activeTripsHasMore(),
  );

  readonly loadMoreBusy = computed(() =>
    this.activeTab() === 'completed' ? this.completedTripsLoadingMore() : this.activeTripsLoadingMore(),
  );

  loadMoreTrips(): void {
    if (this.activeTab() === 'completed') {
      this.store.dispatch(DriverActions.loadDriverCompletedTripsMore());
    } else {
      this.store.dispatch(DriverActions.loadDriverActiveTripsMore());
    }
  }

  private filterActiveTrips(list: TransportOrder[]): TransportOrder[] {
    if (this.driverVerificationRejected()) return [];
    const me = this.userId();
    return list.filter((o) => {
      if (normalizeOrderId(o.driverId) !== me) return false;
      if (o.status === 'pending') return false;
      return DRIVER_ACTIVE_TRIP_STATUSES.has(o.status);
    });
  }

  private filterCompletedTrips(list: TransportOrder[]): TransportOrder[] {
    const me = this.userId();
    return list.filter((o) => {
      if (normalizeOrderId(o.driverId) !== me) return false;
      if (o.status === 'pending') return false;
      return DRIVER_COMPLETED_TRIP_STATUSES.has(o.status);
    });
  }

  /** Tab pills: same as {@link MyOrdersComponent.tabButtonClass} (customer My Orders). */
  tabButtonClass(selected: boolean): string {
    const base =
      'border min-h-[44px] shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
    return selected
      ? `${base} border-primary bg-primary text-primary-foreground shadow-sm`
      : `${base} border-border/40 bg-card/85 backdrop-blur-sm text-muted-foreground hover:border-border hover:bg-secondary/20`;
  }

  /** Compact order id for card headers (last 8 of Mongo `_id`). */
  orderShortId(order: TransportOrder): string {
    const id = normalizeOrderId(order._id);
    return id.length <= 8 ? id.toUpperCase() : id.slice(-8).toUpperCase();
  }

  chatOrder = signal<TransportOrder | null>(null);
  readonly isChatDrawerOpen = computed(() => this.chatOrder() !== null);

  constructor() {
    this.store.dispatch(DriverActions.loadDriverActiveTrips({}));
    this.chatService.getUnreadCounts().subscribe();
    interval(POLL_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.store.dispatch(DriverActions.loadDriverActiveTrips({ silent: true })));
    interval(CHAT_UNREAD_POLL_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.chatService.getUnreadCounts().subscribe());
  }

  customerName(order: TransportOrder): string {
    return driverCustomerName(order);
  }

  displayStatus(status: string): string {
    return driverDisplayStatus(status);
  }

  /**
   * View Route styling — mirrors customer My Orders (emerald emphasis while trip is actionable).
   */
  viewRouteButtonClass(order: TransportOrder): string {
    const base =
      'inline-flex min-h-[44px] w-full shrink-0 items-center justify-center rounded-lg border-border/40 bg-card/85 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-card-foreground hover:bg-secondary/20 sm:w-auto sm:min-w-[120px]';
    if (DRIVER_ROUTE_PREVIEW_PROMINENT_STATUSES.has(order.status)) {
      return `${base} border-primary/20 font-semibold text-primary shadow-sm ring-2 ring-primary/85 ring-offset-2 ring-offset-white`;
    }
    return `${base} text-foreground`;
  }

  cargoImageUrl(order: TransportOrder): string {
    return order.cargoImageUrl ? ORDERS_API_BASE + order.cargoImageUrl : '';
  }

  openCargoLightbox(order: TransportOrder): void {
    const url = this.cargoImageUrl(order);
    if (!url) return;
    if (url.toLowerCase().endsWith('.pdf')) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    this.cargoLightboxUrl.set(url);
  }

  onCargoLightboxClosed(): void {
    this.cargoLightboxUrl.set(null);
  }

  onOpenChat(order: TransportOrder): void {
    const cid = normalizeOrderId(order.customerId);
    const did = normalizeOrderId(order.driverId);
    if (!cid || !did) return;
    const id = normalizeOrderId(order._id);
    if (!id) return;
    this.chatService.setChatDrawerOpenOrderId(id);
    this.chatService.markMessagesAsRead(id).subscribe();
    this.chatOrder.set(order);
  }

  closeChat(): void {
    this.chatService.setChatDrawerOpenOrderId(null);
    this.chatOrder.set(null);
    this.store.dispatch(DriverActions.loadDriverActiveTrips({ silent: true }));
    this.chatService.getUnreadCounts().subscribe();
  }

  viewRoute(order: TransportOrder, event?: Event): void {
    event?.stopPropagation();
    if (this.routePreviewMatches(order)) {
      this.closeRoutePreview();
      return;
    }
    this.routePreviewOrder.set(order);
    this.logger.log('DriverMyTasks: route preview', String(order._id));
  }

  closeRoutePreview(): void {
    this.routePreviewOrder.set(null);
  }

  /** Full-bleed split row aligns with padded driver shell outlet. */
  tripsPageOuterClass(): string {
    const split = this.routePreviewOrder() !== null;
    return split
      ? 'flex min-h-0 w-full flex-1 flex-col overflow-hidden -mx-6 md:-mx-8'
      : 'mx-auto w-full max-w-7xl space-y-4 overflow-x-hidden sm:space-y-6';
  }

  tripsRouteSplitRowClass(): string {
    if (!this.routePreviewOrder()) {
      return 'route-split-root flex min-h-0 w-full flex-1 flex-col';
    }
    return 'route-split-root route-split-root--pinned flex min-h-0 w-full min-w-0 flex-1 flex-col items-stretch lg:flex-row lg:items-stretch lg:overflow-hidden';
  }

  routePreviewMatches(order: TransportOrder): boolean {
    const pinned = this.routePreviewOrder();
    return pinned !== null && String(pinned._id) === String(order._id);
  }

  onTripCardOpenRoute(order: TransportOrder, _event?: Event): void {
    this.viewRoute(order);
  }

  canShowMarkPickedUp(order: TransportOrder): boolean {
    return order.status === 'accepted';
  }

  /** Server maps PATCH `{ status: 'in-transit' }` → `driver_is_on_the_way`; legacy rows may be `picked_up` / `in_progress`. */
  canShowMarkDelivered(order: TransportOrder): boolean {
    const s = order.status;
    return s === 'driver_is_on_the_way' || s === 'picked_up' || s === 'in_progress';
  }

  /**
   * Exactly one active job: duplicate the primary status action above the driver bottom nav so it stays reachable without scrolling.
   */
  readonly stickyTripPrimaryAction = computed((): null | { order: TransportOrder; kind: 'pickup' | 'deliver' } => {
    if (this.activeTab() !== 'active') return null;
    const trips = this.activeTrips();
    if (trips.length !== 1) return null;
    const order = trips[0];
    if (this.canShowMarkPickedUp(order)) return { order, kind: 'pickup' };
    if (this.canShowMarkDelivered(order)) return { order, kind: 'deliver' };
    return null;
  });

  startDelivery(id: string): void {
    this.store.dispatch(DriverActions.updateDriverTripStatus({ id, status: 'in-transit' }));
  }

  markCompleted(id: string): void {
    this.store.dispatch(DriverActions.updateDriverTripStatus({ id, status: 'completed' }));
  }

  isTripBusy(id: string): boolean {
    return this.tripBusyId() === id;
  }

  unreadCountNum(order: TransportOrder): number {
    return this.chatService.badgeUnreadForOrder(order._id, order.unreadCount);
  }

  trackByTripId(_index: number, order: TransportOrder): string {
    return String(order._id);
  }
}
