import { Component, computed, effect, inject, OnDestroy, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { map } from 'rxjs/operators';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { OrdersService, TransportOrder, ORDERS_API_BASE } from '../../../core/services/orders.service';
import { BreakpointObserver } from '@angular/cdk/layout';
import { AuthService } from '../../../core/services/auth.service';
import { SocketService } from '../../../core/services/socket.service';
import { ToastService } from '../../../core/services/toast.service';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { ChatSideDrawerComponent } from '../../../shared/components/chat-side-drawer/chat-side-drawer.component';
import { CargoPhotoLightboxComponent } from '../../../shared/components/cargo-photo-lightbox/cargo-photo-lightbox.component';
import { ChatService } from '../../../core/services/chat.service';
import { customerOrderListStagger } from '../../../shared/components/customer/customer-animations';
import * as CustomerActions from '../../customer/state/customer.actions';
import {
  selectCustomerCompletedTabHasMore,
  selectCustomerCompletedTabLoading,
  selectCustomerCompletedTabLoadingMore,
  selectCustomerCompletedTabOrders,
  selectCustomerCompletedTabTotal,
  selectCustomerOrders,
  selectCustomerOrdersError,
  selectCustomerOrdersHasMore,
  selectCustomerOrdersLoading,
  selectCustomerOrdersLoadingMore,
  selectCustomerRatingError,
  selectCustomerRatingSubmittingOrderId,
} from '../../customer/state/customer.selectors';
import {
  customerStatusLabel,
  orderStatusToBadgeVariant,
} from '../../../shared/utils/order-tracking';
import { normalizeOrderId, orderSubmissionDateIso } from '../../../shared/utils/order-utils';
import { UiBadgeComponent } from '@/components/ui/badge';
import { UiButtonComponent } from '@/components/ui/button';
import { UiCardComponent } from '@/components/ui/card';
import { LoggerService } from '../../../core/services/logger.service';
import { OrderRoutePreviewDialogComponent } from '../../../shared/components/order-route-preview-dialog/order-route-preview-dialog.component';
import {
  ROUTE_PREVIEW_SPLIT_BREAKPOINT,
  routePreviewSplitInitial,
} from '../../../shared/constants/viewport-breakpoints';
import {
  canCustomerPayOrder,
  paymentStatusLabel,
} from '../../../shared/utils/order-payment.util';

/** While “View route” is open, merge `driverLocation` from the API more often than the list poll. */
const ROUTE_PREVIEW_SILENT_POLL_MS = 4000;
const UNREAD_POLL_MS = 5000;
/** Matches React `MyOrders` silent refresh interval. */
const ORDERS_POLL_MS = 10_000;

/**
 * Completed tab: terminal customer-visible outcomes (US + UK spelling for cancelled).
 * Active tab: everything else (pending, accepted, picked_up, in_progress, driver_is_on_the_way, …).
 */
const COMPLETED_TAB_STATUSES = new Set(['delivered', 'completed', 'cancelled', 'canceled']);

@Component({
  selector: 'app-my-orders',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    DatePipe,
    DecimalPipe,
    NgClass,
    SidebarComponent,
    ChatSideDrawerComponent,
    CargoPhotoLightboxComponent,
    EmptyStateComponent,
    UiButtonComponent,
    UiCardComponent,
    UiBadgeComponent,
    OrderRoutePreviewDialogComponent,
  ],
  templateUrl: './my-orders.component.html',
  styleUrl: './my-orders.component.css',
  animations: [customerOrderListStagger],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyOrdersComponent implements OnInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly router = inject(Router);
  private readonly ordersService = inject(OrdersService);
  private readonly socket = inject(SocketService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  chatService = inject(ChatService);
  auth = inject(AuthService);
  private readonly logger = inject(LoggerService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  readonly isRoutePreviewSplitUp = toSignal(
    this.breakpointObserver.observe(ROUTE_PREVIEW_SPLIT_BREAKPOINT).pipe(map((r) => r.matches)),
    { initialValue: routePreviewSplitInitial() },
  );

  /** Compact order id for card headers (last 8 of Mongo `_id`). */
  orderShortId(order: TransportOrder): string {
    const id = normalizeOrderId(order._id);
    return id.length <= 8 ? id.toUpperCase() : id.slice(-8).toUpperCase();
  }

  /** Order passed when opening “View route”; dialog receives {@link routePreviewOrderLive} merged from the store. */
  readonly routePreviewOrder = signal<TransportOrder | null>(null);

  /** Prefer the store copy so polls and `applyCustomerOrderPatch` keep `driverLocation` / status up to date in the modal. */
  readonly routePreviewOrderLive = computed(() => {
    const pinned = this.routePreviewOrder();
    if (!pinned) return null;
    const id = String(pinned._id);
    return (
      this.orders().find((o) => String(o._id) === id) ??
      this.completedTabOrders().find((o) => String(o._id) === id) ??
      pinned
    );
  });

  routePreviewMatches(order: TransportOrder): boolean {
    const pinned = this.routePreviewOrder();
    return pinned !== null && String(pinned._id) === String(order._id);
  }

  /**
   * Hover / active shell for order cards (matches driver Available Jobs route selection).
   */
  orderCardShellClass(order: TransportOrder, variant: 'active' | 'completed'): string {
    const pinned = this.routePreviewMatches(order);
    const base =
      'rounded-xl border border-border/30 border-l-4 bg-secondary/45 backdrop-blur-sm p-2 shadow-surface outline-none cursor-pointer transition-all duration-300 xs:p-4 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';
    const state = pinned
      ? 'border-l-primary bg-primary/15'
      : 'border-l-transparent hover:border-border/50 hover:bg-secondary/90';
    const muted = variant === 'completed' ? ' opacity-90' : '';
    return `${base} ${state}${muted}`;
  }

  /**
   * Opens split-view route preview unless the event originated inside a nested control.
   */
  onOrderCardOpenRoute(order: TransportOrder, event?: Event): void {
    const t = event && 'target' in event ? (event.target as HTMLElement | null) : null;
    if (t?.closest('button, a[href], input, textarea, select')) {
      return;
    }
    this.toggleRoutePreview(order);
  }

  readonly orderStatusToBadgeVariant = orderStatusToBadgeVariant;
  /** ISO for `date` pipe (submittedAt ?? createdAt). */
  readonly submissionDateIso = orderSubmissionDateIso;

  private static readonly ROUTE_PREVIEW_PROMINENT = new Set([
    'accepted',
    'picked_up',
    'in_progress',
    'driver_is_on_the_way',
  ]);

  /**
   * Styles for primary map entry: stronger on {@link ROUTE_PREVIEW_PROMINENT} statuses when the route is actionable.
   */
  viewRouteButtonClass(order: TransportOrder): string {
    const base =
      'inline-flex min-h-[44px] w-full shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-xs font-medium text-foreground hover:bg-secondary/40 hover:text-foreground hover:shadow-btn-secondary md:w-auto';
    if (MyOrdersComponent.ROUTE_PREVIEW_PROMINENT.has(order.status)) {
      return `${base} border-primary/50 font-semibold text-primary ring-2 ring-primary/50 ring-offset-2 ring-offset-background shadow-[0_0_12px_rgba(34,197,94,0.2)]`;
    }
    return base;
  }

  /** Stable list identity for `@for` track (OnPush-friendly). */
  trackByOrderId(_index: number, order: TransportOrder): string {
    return String(order._id);
  }

  readonly orders = toSignal(this.store.select(selectCustomerOrders), { initialValue: [] });
  readonly loading = toSignal(this.store.select(selectCustomerOrdersLoading), { initialValue: false });
  readonly loadingMore = toSignal(this.store.select(selectCustomerOrdersLoadingMore), {
    initialValue: false,
  });
  readonly hasMore = toSignal(this.store.select(selectCustomerOrdersHasMore), { initialValue: false });
  readonly completedTabOrders = toSignal(this.store.select(selectCustomerCompletedTabOrders), { initialValue: [] });
  readonly completedTabTotal = toSignal(this.store.select(selectCustomerCompletedTabTotal), { initialValue: null });
  readonly completedTabLoading = toSignal(this.store.select(selectCustomerCompletedTabLoading), { initialValue: false });
  readonly completedTabLoadingMore = toSignal(this.store.select(selectCustomerCompletedTabLoadingMore), {
    initialValue: false,
  });
  readonly completedTabHasMore = toSignal(this.store.select(selectCustomerCompletedTabHasMore), { initialValue: false });
  /** Mixed “active” list and/or completed-tab list (server scope) — layout + split map. */
  readonly hasOrdersInView = computed(() => {
    if (this.loading() && this.orders().length === 0 && this.completedTabTotal() === null) {
      return false;
    }
    return (
      this.orders().length > 0 ||
      this.completedTabTotal() !== null ||
      this.completedTabOrders().length > 0 ||
      this.auth.user()?.role === 'customer'
    );
  });
  readonly listError = toSignal(this.store.select(selectCustomerOrdersError), { initialValue: null });
  readonly ordersSplitMapOpen = computed(
    () => this.hasOrdersInView() && this.routePreviewOrder() !== null,
  );
  readonly ratingSubmittingOrderId = toSignal(
    this.store.select(selectCustomerRatingSubmittingOrderId),
    { initialValue: null },
  );
  readonly ratingErrorFromStore = toSignal(this.store.select(selectCustomerRatingError), {
    initialValue: null,
  });

  completingId = signal<string | null>(null);
  updatingStatusId = signal<string | null>(null);
  cancellingId = signal<string | null>(null);
  error = signal('');
  orderToRate = signal<TransportOrder | null>(null);
  ratingStars = signal(0);
  reviewText = signal('');
  ratingSuccess = signal(false);
  chatOrder = signal<TransportOrder | null>(null);
  readonly isChatDrawerOpen = computed(() => this.chatOrder() !== null);

  /** Full URL for native `<dialog>` cargo preview (see `openCargoLightbox`). */
  readonly cargoLightboxUrl = signal<string | null>(null);

  private unreadPollTimer: ReturnType<typeof setInterval> | null = null;
  private ordersPollTimer: ReturnType<typeof setInterval> | null = null;

  readonly hideShell = computed(() => this.router.url.includes('/customer/'));

  /**
   * Root layout: customer hub (`/customer/orders`) stretches into the shell main (no second
   * `min-h-dvh` scroll stack). Standalone `/orders/my-orders` keeps the full-viewport layout.
   */
  ordersOuterRootClass(): string {
    const split = this.ordersSplitMapOpen();
    const mobilePb = 'pb-[calc(5rem+env(safe-area-inset-bottom))]';
    if (this.hideShell()) {
      const base = `flex w-full min-w-0 flex-1 min-h-0 flex-col bg-deep ${mobilePb}`;
      return split
        ? `${base} overflow-x-hidden md:overflow-hidden md:pb-0`
        : `${base} overflow-x-hidden md:pb-0`;
    }
    return [
      'flex min-h-dvh flex-col overflow-x-hidden bg-deep',
      mobilePb,
      'md:flex-row',
      split ? 'md:flex-1 md:min-h-0 md:overflow-hidden md:pb-0' : '',
      !split ? 'md:pb-8' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Customer hub uses `shellFullBleed` (no shell padding); add page padding here when not split.
   * Split row is full width like driver pages.
   */
  ordersContentOuterClass(): string {
    const split = this.hasOrdersInView() && this.routePreviewOrder() !== null;
    if (split) {
      return this.hideShell()
        ? 'flex min-h-0 w-full flex-1 flex-col overflow-hidden pt-4 sm:pt-6 lg:pt-8'
        : '-mx-4 flex min-h-0 flex-1 flex-col overflow-hidden sm:-mx-6 lg:-mx-8';
    }
    return this.hideShell()
      ? 'space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8 lg:pb-8'
      : 'app-page-container space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8 lg:pb-8';
  }

  /** Flex row locks height on desktop while the pinned map matches the booking column footprint. */
  ordersRouteSplitRowClass(): string {
    if (!this.routePreviewOrder() || !this.hasOrdersInView()) {
      return 'route-split-root flex min-h-0 w-full min-w-0 flex-1 flex-col';
    }
    const pinned =
      'route-split-root route-split-root--pinned flex min-h-0 w-full min-w-0 flex-1 flex-col items-stretch lg:flex-row lg:items-stretch lg:overflow-hidden';
    return this.hideShell() ? `${pinned} route-split-root--pinned-short` : pinned;
  }

  /** Which list is visible; completed list DOM mounts only when this is `'completed'` (performance). */
  readonly activeTab = signal<'active' | 'completed'>('active');

  /** Active tab uses `GET /orders/mine?scope=active` (see customer effects). */
  readonly activeOrders = computed(() => this.orders());

  readonly activeStaggerKey = computed(() => this.activeOrders().map((o) => o._id).join(','));

  readonly completedStaggerKey = computed(() => this.completedTabOrders().map((o) => o._id).join(','));

  selectOrdersTab(tab: 'active' | 'completed'): void {
    this.activeTab.set(tab);
    if (
      tab === 'completed' &&
      this.completedTabTotal() === null &&
      !this.completedTabLoading()
    ) {
      this.store.dispatch(CustomerActions.loadCustomerCompletedOrders());
    }
  }

  private isCompletedTabStatus(status: string | undefined): boolean {
    const s = String(status ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    return COMPLETED_TAB_STATUSES.has(s);
  }

  /** Completed tab: allow rating when backend marks job done (`completed` / `delivered` variants). */
  canRateCompletedDelivery(order: TransportOrder): boolean {
    if (this.auth.user()?.role !== 'customer') return false;
    const s = String(order.status ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (s !== 'delivered' && s !== 'completed') return false;
    return !order.hasReview && order.rating == null;
  }

  /** Tab pills: separated, selected = solid emerald; inactive = bordered. */
  tabButtonClass(selected: boolean): string {
    const base =
      'border min-h-[44px] shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
    return selected
      ? `${base} border-primary bg-primary font-bold text-primary-foreground shadow-btn-primary`
      : `${base} border-border bg-secondary/40 text-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground`;
  }

  constructor() {
    this.store.dispatch(CustomerActions.loadCustomerOrders());
    this.socket.connect();

    effect((onCleanup) => {
      const open = this.routePreviewOrder();
      if (!open || this.auth.user()?.role !== 'customer') return;
      const t = window.setInterval(
        () => this.store.dispatch(CustomerActions.loadCustomerOrdersSilent()),
        ROUTE_PREVIEW_SILENT_POLL_MS,
      );
      onCleanup(() => window.clearInterval(t));
    });

    effect(() => {
      const updated = this.socket.onOrderUpdated();
      if (!updated) return;
      this.store.dispatch(CustomerActions.applyCustomerOrderPatch({ order: updated }));
      this.socket.clearOrderUpdate();
    });

    effect(() => {
      const completed = this.socket.onOrderCompleted();
      if (!completed) return;
      this.toast.show('Your move has been completed!', 'success');
      this.store.dispatch(CustomerActions.applyCustomerOrderPatch({ order: completed }));
      const custId =
        completed.customerId && typeof completed.customerId === 'object'
          ? String(completed.customerId._id ?? '')
          : String(completed.customerId ?? '');
      const done = completed.status === 'delivered' || completed.status === 'completed';
      const unrated = !completed.hasReview && completed.rating == null;
      if (custId === this.auth.user()?.id && done && unrated) {
        this.orderToRate.set(completed);
        this.ratingStars.set(0);
        this.reviewText.set('');
        this.ratingSuccess.set(false);
      }
      this.socket.clearOrderCompleted();
    });
  }

  ngOnInit(): void {
    this.chatService.getUnreadCounts().subscribe();
    this.unreadPollTimer = setInterval(
      () => this.chatService.getUnreadCounts().subscribe(),
      UNREAD_POLL_MS,
    );
    this.ordersPollTimer = setInterval(
      () => this.store.dispatch(CustomerActions.loadCustomerOrdersSilent()),
      ORDERS_POLL_MS,
    );
  }

  ngOnDestroy(): void {
    if (this.unreadPollTimer) {
      clearInterval(this.unreadPollTimer);
      this.unreadPollTimer = null;
    }
    if (this.ordersPollTimer) {
      clearInterval(this.ordersPollTimer);
      this.ordersPollTimer = null;
    }
  }

  openRateModal(order: TransportOrder): void {
    const unrated = !order.hasReview && order.rating == null;
    const ok =
      (order.status === 'delivered' || order.status === 'completed') && unrated;
    if (!ok) return;
    const custId =
      order.customerId && typeof order.customerId === 'object'
        ? String(order.customerId._id ?? '')
        : String(order.customerId ?? '');
    if (custId !== this.auth.user()?.id) return;
    this.orderToRate.set(order);
    this.ratingStars.set(0);
    this.reviewText.set('');
    this.ratingSuccess.set(false);
  }

  closeRateModal(): void {
    this.orderToRate.set(null);
    this.ratingStars.set(0);
    this.reviewText.set('');
    this.ratingSuccess.set(false);
  }

  setStar(value: number): void {
    this.ratingStars.set(value);
  }

  readonly loadMoreVisible = computed(() =>
    this.activeTab() === 'completed' ? this.completedTabHasMore() : this.hasMore(),
  );

  readonly loadMoreBusy = computed(() =>
    this.activeTab() === 'completed' ? this.completedTabLoadingMore() : this.loadingMore(),
  );

  submitRating(): void {
    const order = this.orderToRate();
    const stars = this.ratingStars();
    if (!order || stars < 1 || stars > 5) return;
    this.error.set('');

    this.actions$
      .pipe(
        ofType(CustomerActions.submitCustomerRatingSuccess, CustomerActions.submitCustomerRatingFailure),
        take(1),
      )
      .subscribe((action) => {
        const a = action as
          | ReturnType<typeof CustomerActions.submitCustomerRatingSuccess>
          | ReturnType<typeof CustomerActions.submitCustomerRatingFailure>;
        if (a.type === CustomerActions.submitCustomerRatingSuccess.type) {
          this.ratingSuccess.set(true);
          setTimeout(() => this.closeRateModal(), 1500);
        }
      });

    this.store.dispatch(
      CustomerActions.submitCustomerRating({
        orderId: normalizeOrderId(order._id),
        rating: stars,
        review: this.reviewText().trim() || undefined,
      }),
    );
  }

  loadMoreOrders(): void {
    if (this.activeTab() === 'completed') {
      this.store.dispatch(CustomerActions.loadCustomerCompletedOrdersMore());
    } else {
      this.store.dispatch(CustomerActions.loadCustomerOrdersMore());
    }
  }

  canCancelOrder(order: TransportOrder): boolean {
    if (order.status !== 'pending') return false;
    if (this.auth.user()?.role !== 'customer') return false;
    const custId =
      order.customerId && typeof order.customerId === 'object'
        ? String(order.customerId._id ?? '')
        : String(order.customerId ?? '');
    return custId === this.auth.user()?.id;
  }

  canPayOrder(order: TransportOrder): boolean {
    if (this.auth.user()?.role !== 'customer') return false;
    return canCustomerPayOrder(order);
  }

  paymentLabel(order: TransportOrder): string {
    return paymentStatusLabel(order.paymentStatus);
  }

  goToCheckout(order: TransportOrder, event?: Event): void {
    event?.stopPropagation();
    void this.router.navigate(['/customer/orders', order._id, 'checkout']);
  }

  cancelOrder(order: TransportOrder): void {
    if (!this.canCancelOrder(order)) return;
    this.confirmDialog.confirm('Are you sure you want to cancel this order?', 'Cancel order').subscribe((ok) => {
      if (!ok) return;
      const id = normalizeOrderId(order._id);
      this.cancellingId.set(id);
      this.error.set('');
      this.ordersService.cancelOrder(id).subscribe({
        next: (updated) => {
          this.store.dispatch(CustomerActions.applyCustomerOrderPatch({ order: updated }));
          this.cancellingId.set(null);
        },
        error: () => {
          this.cancellingId.set(null);
        },
      });
    });
  }

  statusLabel(status: string): string {
    return customerStatusLabel(status);
  }

  canComplete(order: TransportOrder): boolean {
    if (!['accepted', 'in_progress', 'picked_up', 'driver_is_on_the_way'].includes(order.status))
      return false;
    const driverId =
      order.driverId && typeof order.driverId === 'object'
        ? String(order.driverId._id ?? '')
        : String(order.driverId ?? '');
    return driverId === this.auth.user()?.id;
  }

  startDelivery(order: TransportOrder): void {
    const id = normalizeOrderId(order._id);
    if (!id) {
      this.error.set('Order ID is missing.');
      return;
    }
    this.updatingStatusId.set(id);
    this.error.set('');
    this.ordersService.updateOrderStatus(id, 'in-transit').subscribe({
      next: (updated) => {
        this.store.dispatch(CustomerActions.applyCustomerOrderPatch({ order: updated }));
        this.updatingStatusId.set(null);
      },
      error: () => {
        this.updatingStatusId.set(null);
      },
      complete: () => this.updatingStatusId.set(null),
    });
  }

  markAsDelivered(order: TransportOrder): void {
    const id = normalizeOrderId(order._id);
    if (!id) {
      this.error.set('Order ID is missing.');
      return;
    }
    this.confirmDialog.confirm('Mark this trip as delivered and complete the order?', 'Complete Trip').subscribe((ok) => {
      if (!ok) return;
      this.updatingStatusId.set(id);
      this.error.set('');
      this.ordersService.updateOrderStatus(id, 'completed').subscribe({
        next: (updated) => {
          this.store.dispatch(CustomerActions.applyCustomerOrderPatch({ order: updated }));
          this.updatingStatusId.set(null);
        },
        error: () => {
          this.updatingStatusId.set(null);
        },
        complete: () => this.updatingStatusId.set(null),
      });
    });
  }

  completeOrder(order: TransportOrder): void {
    const id = normalizeOrderId(order._id);
    this.completingId.set(id);
    this.error.set('');
    this.ordersService.completeOrder(id).subscribe({
      next: (updated) => {
        this.store.dispatch(CustomerActions.applyCustomerOrderPatch({ order: updated }));
        this.completingId.set(null);
      },
      error: () => {
        this.completingId.set(null);
      },
      complete: () => {
        this.completingId.set(null);
      },
    });
  }

  canChat(order: TransportOrder): boolean {
    if (!['accepted', 'in_progress', 'picked_up', 'driver_is_on_the_way'].includes(order.status))
      return false;
    return !!(order.driverId && (typeof order.driverId === 'object' ? order.driverId._id : order.driverId));
  }

  onOpenChat(order: TransportOrder): void {
    if (!this.canChat(order)) return;
    const id = normalizeOrderId(order._id);
    if (!id) return;
    this.chatService.setChatDrawerOpenOrderId(id);
    this.chatService.markMessagesAsRead(id).subscribe();
    this.chatOrder.set(order);
  }

  closeChat(): void {
    this.chatService.setChatDrawerOpenOrderId(null);
    this.chatOrder.set(null);
    this.chatService.getUnreadCounts().subscribe();
  }

  /** Same modal as My Trips (driver): directions polyline + live driver marker when applicable. */
  viewRoute(order: TransportOrder, event?: Event): void {
    event?.stopPropagation();
    this.toggleRoutePreview(order);
  }

  toggleRoutePreview(order: TransportOrder): void {
    if (this.routePreviewMatches(order)) {
      this.closeRoutePreview();
      return;
    }
    this.routePreviewOrder.set(order);
    if (this.auth.user()?.role === 'customer') {
      this.store.dispatch(CustomerActions.loadCustomerOrdersSilent());
    }
    this.logger.log('MyOrders: opening route preview', String(order._id));
  }

  closeRoutePreview(): void {
    this.routePreviewOrder.set(null);
  }

  cargoImageUrl(order: TransportOrder): string {
    return order.cargoImageUrl ? ORDERS_API_BASE + order.cargoImageUrl : '';
  }

  /**
   * Driver name: prefers API `assignedDriverName`, then populated `driverId` (first/last).
   * Backend: `GET /api/orders/mine` adds `assignedDriverName`; socket/order patches should include populated `driverId` or the same field.
   */
  assignedDriverDisplay(order: TransportOrder): string {
    const named = order.assignedDriverName?.trim();
    if (named) return named;
    const d = order.driverId;
    if (d && typeof d === 'object') {
      const fromParts = [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
      if (fromParts) return fromParts;
      if (d.name?.trim()) return d.name.trim();
    }
    return 'Assigned';
  }

  /** Customer-only: show driver once a driver is assigned and the job is past pending. */
  showDriverLineForCustomer(order: TransportOrder): boolean {
    if (this.auth.user()?.role !== 'customer') return false;
    if (!order.driverId) return false;
    return ['accepted', 'in_progress', 'picked_up', 'driver_is_on_the_way', 'delivered', 'completed'].includes(
      order.status,
    );
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

  /** Sync signal when the dialog closes (Escape, backdrop, or programmatic `close()`). */
  onCargoDialogClosed(): void {
    this.cargoLightboxUrl.set(null);
  }

}
