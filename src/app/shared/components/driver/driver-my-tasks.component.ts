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
import { OrderRoutePreviewDialogComponent } from '../order-route-preview-dialog/order-route-preview-dialog.component';
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
import { normalizeOrderId, orderShortId as orderShortIdLabel, orderSubmissionDateIso } from '../../utils/order-utils';
import { downloadDriverMoveReceipt } from '../../utils/driver-move-receipt';
import { UiButtonComponent } from '@/components/ui/button';
import { DriverJobCardComponent } from './driver-job-card/driver-job-card.component';

const POLL_MS = 10_000;

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
  if (status === 'driver_is_on_the_way') return 'Driver is on the way';
  if (status === 'picked_up' || status === 'in_progress') return 'Picked up';
  if (status === 'delivered' || status === 'completed') return 'Delivered';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'accepted') return 'Accepted';
  return status || '—';
}

@Component({
  selector: 'app-driver-my-tasks',
  standalone: true,
  imports: [
    DatePipe,
    NgClass,
    CargoPhotoLightboxComponent,
    UiButtonComponent,
    DriverJobCardComponent,
    OrderRoutePreviewDialogComponent,
  ],
  templateUrl: './driver-my-tasks.component.html',
  styleUrl: './driver-my-tasks.component.css',
  animations: [customerOrderListStagger],
})
export class DriverMyTasksComponent {
  readonly tripPrimaryBtnClass =
    'inline-flex min-h-[44px] w-full min-w-0 flex-1 items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 sm:w-auto sm:min-w-[8rem] sm:flex-none';

  private readonly store = inject(Store);
  private readonly auth = inject(AuthStore);
  private readonly logger = inject(LoggerService);
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
      ? `${base} border-primary bg-primary text-primary-foreground`
      : `${base} border-border/40 bg-card/85 backdrop-blur-sm text-muted-foreground hover:border-border hover:bg-secondary/20`;
  }

  /** Compact order id for card headers (last 8 of Mongo `_id`). */
  orderShortId(order: TransportOrder): string {
    return orderShortIdLabel(order._id);
  }

  constructor() {
    this.store.dispatch(DriverActions.loadDriverActiveTrips({}));
    interval(POLL_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.store.dispatch(DriverActions.loadDriverActiveTrips({ silent: true })));
  }

  customerName(order: TransportOrder): string {
    return driverCustomerName(order);
  }

  displayStatus(status: string): string {
    return driverDisplayStatus(status);
  }

  /** Same View route control as customer My moves. */
  viewRouteButtonClass(): string {
    return 'inline-flex min-h-[44px] w-full min-w-0 items-center justify-center rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-xs font-medium text-foreground hover:bg-secondary/40 hover:text-foreground hover:shadow-btn-secondary sm:w-auto sm:min-w-[11rem]';
  }

  /** Same half-width list column as customer My moves while the route map is open. */
  routeListColumnClass(): string {
    const base = 'w-full shrink-0 overflow-y-auto p-4 transition-all duration-300 md:min-h-0';
    return this.routePreviewOrder() ? `${base} lg:w-1/2` : base;
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

  downloadReceipt(order: TransportOrder, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    void downloadDriverMoveReceipt(order);
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

  /** Same Google Maps leg as the active delivery screen. */
  openGoogleNavigation(order: TransportOrder, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    const pickup = order.pickupLocation;
    const dropoff = order.dropoffLocation;
    if (!pickup?.lat || !dropoff?.lat || typeof window === 'undefined') return;
    const status = order.status;
    const url =
      status === 'picked_up' || status === 'in_progress'
        ? `https://www.google.com/maps/dir/?api=1&origin=${pickup.lat},${pickup.lng}&destination=${dropoff.lat},${dropoff.lng}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${pickup.lat},${pickup.lng}&travelmode=driving&dir_action=navigate`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  closeRoutePreview(): void {
    this.routePreviewOrder.set(null);
  }

  /**
   * Closed list uses the shell padding, same as customer My moves.
   * With the route open, cancel that desktop padding so the card column and map
   * each take half of the same full content width as the customer page.
   */
  tripsPageOuterClass(): string {
    const split = this.routePreviewOrder() !== null;
    return split
      ? 'flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:w-[calc(100%+4rem)] lg:-mx-8'
      : 'w-full space-y-4 overflow-x-hidden sm:space-y-6';
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

  canShowOnTheWay(order: TransportOrder): boolean {
    return order.status === 'accepted';
  }

  canShowMarkPickedUp(order: TransportOrder): boolean {
    return order.status === 'driver_is_on_the_way';
  }

  canShowMarkDelivered(order: TransportOrder): boolean {
    const s = order.status;
    return s === 'picked_up' || s === 'in_progress';
  }

  /**
   * Exactly one active job: duplicate the primary status action above the driver bottom nav so it stays reachable without scrolling.
   */
  readonly stickyTripPrimaryAction = computed((): null | { order: TransportOrder; kind: 'on-the-way' | 'pickup' | 'deliver' } => {
    if (this.activeTab() !== 'active') return null;
    const trips = this.activeTrips();
    if (trips.length !== 1) return null;
    const order = trips[0];
    if (this.canShowOnTheWay(order)) return { order, kind: 'on-the-way' };
    if (this.canShowMarkPickedUp(order)) return { order, kind: 'pickup' };
    if (this.canShowMarkDelivered(order)) return { order, kind: 'deliver' };
    return null;
  });

  startDelivery(id: string): void {
    this.store.dispatch(DriverActions.updateDriverTripStatus({ id, status: 'in-transit' }));
  }

  markPickedUp(id: string): void {
    this.store.dispatch(DriverActions.updateDriverTripStatus({ id, status: 'picked-up' }));
  }

  markCompleted(id: string): void {
    this.store.dispatch(DriverActions.updateDriverTripStatus({ id, status: 'completed' }));
  }

  isTripBusy(id: string): boolean {
    return this.tripBusyId() === id;
  }

  trackByTripId(_index: number, order: TransportOrder): string {
    return String(order._id);
  }
}
