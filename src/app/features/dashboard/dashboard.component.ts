import {
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ViewChild,
} from '@angular/core';
import { DecimalPipe, NgClass, NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService, AuthUser } from '../../core/services/auth.service';
import { FcmService } from '../../core/services/fcm.service';
import { OrdersService, OrderSummaryCustomer, OrderSummaryDriver, TransportOrder } from '../../core/services/orders.service';
import { UsersService } from '../../core/services/users.service';
import { LucideAngularModule } from 'lucide-angular';
import { UiCardComponent, UiCardContentComponent } from '@/components/ui/card';
import { AppLayoutComponent } from '../../shared/components/app-layout/app-layout.component';
import { AppFooterComponent } from '../../shared/components/app-footer/app-footer.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import {
  customerOrderSegmentFilled,
  orderSegmentBarFilledClass,
} from '../../shared/utils/order-tracking';
import { DriverAnalyticsComponent } from '../driver/driver-analytics/driver-analytics.component';
import { driverNetEarningsForOrder } from '../../shared/utils/order-commission.util';

/** Dashboard charts use the newest trips. The earnings window is 30 days. */
const DRIVER_CHART_ORDER_CAP = 100;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    DecimalPipe,
    NgClass,
    NgTemplateOutlet,
    LucideAngularModule,
    AppLayoutComponent,
    AppFooterComponent,
    EmptyStateComponent,
    UiCardComponent,
    UiCardContentComponent,
    DriverAnalyticsComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private fcm = inject(FcmService);
  private cdr = inject(ChangeDetectorRef);
  ordersService = inject(OrdersService);
  usersService = inject(UsersService);
  router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Customer/driver shells already render {@link SidebarComponent}; omit nested {@link AppLayoutComponent}. */
  readonly hideShell = computed(() => {
    const p = this.router.url.split('?')[0] ?? '';
    return p.includes('/customer/') || p.includes('/driver/');
  });

  /** Local copy updated by currentUser$ subscription so UI reacts when user is refreshed. */
  user: AuthUser | null = null;

  summary = signal<OrderSummaryCustomer | OrderSummaryDriver | null>(null);
  summaryLoading = signal(true);

  /** Customer's latest active order for the dashboard hero. */
  latestActiveOrder = signal<TransportOrder | null>(null);
  /** True until the first active-order request finishes. */
  readonly activeOrderLoading = signal(true);

  /** Driver's current trip, preferred over an open job. */
  readonly driverActiveTrip = signal<TransportOrder | null>(null);
  /** Newest open job when the driver has no current trip. */
  readonly driverNextJob = signal<TransportOrder | null>(null);
  readonly driverFocusLoading = signal(false);

  /** Driver's average rating from completed orders */
  driverRating = signal<{ averageRating: number | null; totalRatings: number } | null>(null);

  /** All driver trips — feeds analytics charts from existing data */
  driverChartOrders = signal<TransportOrder[]>([]);

  @ViewChild(DriverAnalyticsComponent) driverAnalytics?: DriverAnalyticsComponent;

  private sub?: { unsubscribe: () => void };
  private authSub?: { unsubscribe: () => void };

  get isCustomer() {
    return this.user?.role === 'customer';
  }

  get isDriver() {
    return this.user?.role === 'driver';
  }

  get customerSummary() {
    const s = this.summary();
    return s && 'total' in s ? s : null;
  }

  get driverSummary() {
    const s = this.summary();
    return s && 'available' in s ? s : null;
  }

  ngOnInit(): void {
    this.user = this.auth.user();
    this.authSub = this.auth.currentUser$.subscribe((u) => {
      this.user = u;
      this.cdr.detectChanges();
    });
    this.loadSummary();
    this.loadLatestActiveOrder();
    this.loadDriverFocus();
    this.loadDriverRating();
    this.loadDriverChartOrders();
    void this.fcm.ensurePushRegistrationOnDashboard();
    this.sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        const path = this.router.url.split('?')[0] ?? '';
        if (
          path === '/dashboard' ||
          path.startsWith('/dashboard/') ||
          path === '/customer/dashboard' ||
          path === '/driver/dashboard'
        ) {
          this.loadSummary();
          this.loadLatestActiveOrder();
          this.loadDriverFocus();
          this.loadDriverRating();
          this.loadDriverChartOrders();
          queueMicrotask(() => this.driverAnalytics?.reload());
          void this.fcm.ensurePushRegistrationOnDashboard();
        }
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.authSub?.unsubscribe();
  }

  loadSummary(): void {
    this.summaryLoading.set(true);
    this.ordersService.getOrderSummary().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.summary.set(data);
      },
      error: () => {
        this.summary.set(null);
      },
      complete: () => this.summaryLoading.set(false),
    });
  }

  /** Load customer's latest active order for dashboard status display */
  loadLatestActiveOrder(): void {
    if (!this.isCustomer) {
      this.latestActiveOrder.set(null);
      this.activeOrderLoading.set(false);
      return;
    }
    this.activeOrderLoading.set(true);
    this.ordersService
      .getMyOrders({ view: 'summary', scope: 'active', limit: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ orders }) => {
          this.latestActiveOrder.set(orders[0] ?? null);
          this.activeOrderLoading.set(false);
        },
        error: () => {
          this.latestActiveOrder.set(null);
          this.activeOrderLoading.set(false);
        },
      });
  }

  /** Current trip first. If there is none, the first open job in the driver's districts. */
  loadDriverFocus(): void {
    if (!this.isDriver || !this.user?.isVerified) {
      this.driverActiveTrip.set(null);
      this.driverNextJob.set(null);
      this.driverFocusLoading.set(false);
      return;
    }
    this.driverFocusLoading.set(true);
    this.ordersService
      .getMyOrders({
        view: 'summary',
        scope: 'active',
        limit: 1,
        skipGlobalErrorToast: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ orders }) => {
          const trip = orders[0] ?? null;
          this.driverActiveTrip.set(trip);
          if (trip) {
            this.driverNextJob.set(null);
            this.driverFocusLoading.set(false);
            return;
          }
          this.loadDriverNextJob();
        },
        error: () => {
          this.driverActiveTrip.set(null);
          this.loadDriverNextJob();
        },
      });
  }

  private loadDriverNextJob(): void {
    this.ordersService
      .getOrders({ limit: 1, skipGlobalErrorToast: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const list = Array.isArray(res) ? res : (res.orders ?? []);
          this.driverNextJob.set(list[0] ?? null);
          this.driverFocusLoading.set(false);
        },
        error: () => {
          this.driverNextJob.set(null);
          this.driverFocusLoading.set(false);
        },
      });
  }

  /** One sentence for the customer's current move. */
  moveStatusSentence(status: string): string {
    switch (status) {
      case 'pending':
        return 'Waiting for a driver.';
      case 'accepted':
        return 'A driver accepted your move.';
      case 'picked_up':
        return 'Your driver has picked up the load.';
      case 'driver_is_on_the_way':
      case 'in_progress':
      case 'delivery_in_progress':
        return 'Your driver is on the way.';
      case 'delivered':
      case 'completed':
        return 'This move is finished.';
      default:
        return 'Move update.';
    }
  }

  driverTripSentence(status: string): string {
    if (status === 'accepted') return 'You accepted this job.';
    return 'This delivery is in progress.';
  }

  driverPay(order: TransportOrder): number {
    return driverNetEarningsForOrder(order);
  }

  /** Load driver's average rating for dashboard */
  loadDriverRating(): void {
    if (!this.isDriver) return;
    this.usersService.getDriverRating().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => this.driverRating.set(res),
      error: () => this.driverRating.set(null),
    });
  }

  /** Load driver's newest trips for analytics charts (summary fields only). */
  loadDriverChartOrders(): void {
    if (!this.isDriver) return;
    this.ordersService
      .getMyOrders({
        skipGlobalErrorToast: true,
        view: 'summary',
        limit: DRIVER_CHART_ORDER_CAP,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const list = Array.isArray(res) ? res : (res.orders ?? []);
          this.driverChartOrders.set(list);
        },
        error: () => this.driverChartOrders.set([]),
      });
  }

  readonly orderSegmentBarFilledClass = orderSegmentBarFilledClass;

  /** Progress bar segments: Submitted → Accepted → On the way → Done */
  orderSegmentFilled(status: string, index: 0 | 1 | 2 | 3): boolean {
    return customerOrderSegmentFilled(status, index);
  }
}
