import {
  Component,
  DestroyRef,
  inject,
  signal,
  OnInit,
  HostListener,
  ViewChild,
  computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, finalize, interval } from 'rxjs';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import {
  AdminService,
  AdminUser,
  AdminOrder,
  PendingVerificationUser,
  ADMIN_API_BASE,
} from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractHttpErrorMessage } from '../../../core/utils/http-error';
import { SocketService } from '../../../core/services/socket.service';
import {
  RejectDriverDialogComponent,
  RejectDriverDialogData,
} from '../reject-driver-dialog/reject-driver-dialog.component';
import { AdminFleetComponent } from '../../../components/admin/admin-fleet.component';
import { AdminLogisticsComponent } from '../../../components/admin/admin-logistics.component';
import { AdminNotifyComponent } from '../../../components/admin/admin-notify.component';
import { AdminAnalyticsComponent } from '../admin-analytics/admin-analytics.component';
import { AdminCustomersComponent } from '../admin-customers/admin-customers.component';
import { AdminDriversComponent } from '../admin-drivers/admin-drivers.component';
import { AdminOrdersComponent } from '../admin-orders/admin-orders.component';
import { UiButtonComponent } from '@/components/ui/button';
import { UiDialogBackdropComponent, UiDialogPanelComponent } from '@/components/ui/dialog';
import { AppLogoComponent } from '../../../shared/components/app-logo/app-logo.component';
import { LucideAngularModule } from 'lucide-angular';
import {
  ADMIN_FLEET_TAB,
  ADMIN_LOGISTICS_TAB,
  type AdminFleetTabId,
  type AdminLogisticsTabId,
  driverMatchesFleetNotVerifiedTab,
  driverMatchesFleetPendingTab,
  driverMatchesFleetVerifiedTab,
  orderMatchesLogisticsTab,
} from '../../../core/constants/statuses';

const ADMIN_OVERVIEW_POLL_MS = 30_000;

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    MatDialogModule,
    AdminFleetComponent,
    AdminLogisticsComponent,
    AdminNotifyComponent,
    AdminAnalyticsComponent,
    AdminCustomersComponent,
    AdminDriversComponent,
    AdminOrdersComponent,
    UiButtonComponent,
    UiDialogBackdropComponent,
    UiDialogPanelComponent,
    AppLogoComponent,
    LucideAngularModule,
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
})
export class AdminDashboardComponent implements OnInit {
  /** Expose tab id constants to the template (avoids magic strings). */
  readonly fleetTab = ADMIN_FLEET_TAB;
  readonly logisticsTab = ADMIN_LOGISTICS_TAB;

  @ViewChild(AdminLogisticsComponent) logisticsView?: AdminLogisticsComponent;
  @ViewChild(AdminAnalyticsComponent) analyticsView?: AdminAnalyticsComponent;

  private adminService = inject(AdminService);
  readonly auth = inject(AuthService);
  private http = inject(HttpClient);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);
  private readonly socket = inject(SocketService);
  private readonly destroyRef = inject(DestroyRef);

  users = signal<AdminUser[]>([]);
  orders = signal<AdminOrder[]>([]);
  loading = signal(true);
  error = signal('');
  verifyingId = signal<string | null>(null);
  readonly licenseBaseUrl = ADMIN_API_BASE;
  /** Document / vehicle image preview modal. */
  licensePreviewUrl = signal<string | null>(null);
  vehiclePhotoPreviewUrl = signal<string | null>(null);

  /** Logistics Control: in_progress → API `picked_up`, completed → API `delivered`. */
  selectedLogisticsTab = signal<AdminLogisticsTabId>(ADMIN_LOGISTICS_TAB.IN_PROGRESS);
  section = signal<
    'analytics' | 'customers' | 'driversTable' | 'ordersTable' | 'drivers' | 'orders' | 'notify'
  >('analytics');

  readonly sidebarOpen = signal(false);

  readonly sectionTitle = computed(() => {
    if (this.section() === 'analytics') return 'Dashboard · Analytics';
    if (this.section() === 'customers') return 'Management · Customers';
    if (this.section() === 'driversTable') return 'Management · Drivers';
    if (this.section() === 'ordersTable') return 'Management · Orders';
    if (this.section() === 'orders') return 'Dashboard · Order management';
    if (this.section() === 'notify') return 'Developer tools';
    const tab = this.driverTab();
    if (tab === ADMIN_FLEET_TAB.VERIFIED) return 'User management';
    if (tab === ADMIN_FLEET_TAB.PENDING) return 'Driver approvals';
    if (tab === ADMIN_FLEET_TAB.NOT_VERIFIED) return 'Driver onboarding';
    return 'Fleet management';
  });

  /** Notify subsection: push vs email */
  notifyTab = signal<'push' | 'email'>('push');

  readonly emailScenarios: ReadonlyArray<{
    id: string;
    label: string;
    trigger: string;
  }> = [
    { id: 'welcome_signup', label: 'Welcome email', trigger: 'New user signup' },
    { id: 'order_confirmation', label: 'Order confirmation', trigger: 'Order created' },
    { id: 'driver_assigned', label: 'Driver assigned', trigger: 'Driver accepts order' },
    { id: 'receipt_invoice', label: 'Receipt / invoice', trigger: 'Order completed' },
    { id: 'password_reset', label: 'Password reset', trigger: 'Forgot password' },
  ];

  selectedEmailScenario = signal(this.emailScenarios[0]?.id ?? 'welcome_signup');
  emailScenarioSending = signal(false);
  emailScenarioResult = signal('');

  driverTab = signal<AdminFleetTabId>(ADMIN_FLEET_TAB.PENDING);
  focusedOrderId = signal<string | null>(null);
  selectedOrder = signal<AdminOrder | null>(null);
  selectedDriver = signal<AdminUser | PendingVerificationUser | null>(null);

  readonly filteredOrders = computed(() => {
    const tab = this.selectedLogisticsTab();
    return this.orders().filter((o) => orderMatchesLogisticsTab(o.status, tab));
  });

  readonly mapOrders = computed(() => {
    const focusId = this.focusedOrderId();
    if (!focusId) return [] as AdminOrder[];
    return this.filteredOrders().filter((o) => o._id === focusId);
  });

  readonly pendingDrivers = computed(() => this.users().filter((u) => driverMatchesFleetPendingTab(u)));
  readonly verifiedDrivers = computed(() => this.users().filter((u) => driverMatchesFleetVerifiedTab(u)));
  readonly notVerifiedDrivers = computed(() => this.users().filter((u) => driverMatchesFleetNotVerifiedTab(u)));

  get totalDriversCount(): number {
    return this.users().filter((u) => u.role === 'driver').length;
  }

  ngOnInit(): void {
    this.loadOverview();
    interval(ADMIN_OVERVIEW_POLL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadOverview({ silent: true }));
    const unsubVerification = this.socket.onNewVerificationRequest(() => {
      this.toast.show('New driver verification request', 'info');
      this.loadOverview({ silent: true });
    });
    this.destroyRef.onDestroy(() => unsubVerification());
  }

  /**
   * Loads users + orders from GET /api/admin/overview (pending drivers come from `users`).
   * @param options.silent — when true, skips loading flag and main error banner (for background poll).
   */
  loadOverview(options?: { silent?: boolean }): void {
    const silent = options?.silent === true;
    if (!silent) {
    this.loading.set(true);
    this.error.set('');
    }
    this.adminService
      .getOverview({ skipGlobalErrorToast: silent })
      .pipe(
        catchError(() => EMPTY),
        finalize(() => {
          if (!silent) this.loading.set(false);
        }),
      )
      .subscribe({
      next: (res) => {
        this.users.set(res.users ?? []);
        this.orders.set(res.orders ?? []);
        const visible = this.mapOrders();
          if (visible.length === 0) {
            this.selectedOrder.set(null);
          }
        if (this.section() === 'analytics') {
          this.analyticsView?.reload();
        }
        },
      });
  }

  setSection(
    s: 'analytics' | 'customers' | 'driversTable' | 'ordersTable' | 'drivers' | 'orders' | 'notify',
  ): void {
    this.section.set(s);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  /** Mobile drawer: restores map layout after programmatic panel changes. */
  private logisticsResizeSoon(): void {
    setTimeout(() => this.logisticsView?.mapResize(), 40);
  }

  openDashboard(): void {
    this.setSection('analytics');
    this.closeSidebar();
  }

  openCustomersTable(): void {
    this.setSection('customers');
    this.closeSidebar();
  }

  openDriversTable(): void {
    this.setSection('driversTable');
    this.closeSidebar();
  }

  openOrdersTable(): void {
    this.setSection('ordersTable');
    this.closeSidebar();
  }

  onViewCustomer(user: AdminUser): void {
    this.toast.show(`Customer: ${[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}`, 'success');
  }

  onViewDriver(user: AdminUser): void {
    this.setSection('drivers');
    this.setDriverTab(ADMIN_FLEET_TAB.VERIFIED);
    this.selectedDriver.set(user);
    this.closeSidebar();
  }

  onViewOrderFromTable(order: AdminOrder): void {
    const s = (order.status ?? '').toLowerCase();
    const tab =
      s === 'cancelled' || s === 'canceled'
        ? ADMIN_LOGISTICS_TAB.CANCELLED
        : s === 'delivered' || s === 'completed'
          ? ADMIN_LOGISTICS_TAB.COMPLETED
          : ADMIN_LOGISTICS_TAB.IN_PROGRESS;
    this.setSection('orders');
    this.selectedLogisticsTab.set(tab);
    this.selectOrder(order);
    this.closeSidebar();
    this.logisticsResizeSoon();
  }

  openOrderManagement(): void {
    this.setSection('orders');
    this.focusedOrderId.set(null);
    this.selectedOrder.set(null);
    this.selectedLogisticsTab.set(ADMIN_LOGISTICS_TAB.IN_PROGRESS);
    this.closeSidebar();
    this.logisticsResizeSoon();
  }

  openUserManagement(): void {
    this.setSection('drivers');
    this.setDriverTab(ADMIN_FLEET_TAB.VERIFIED);
    this.closeSidebar();
  }

  openDriverApprovals(): void {
    this.setSection('drivers');
    this.setDriverTab(ADMIN_FLEET_TAB.PENDING);
    this.closeSidebar();
  }

  openNotifyTools(): void {
    this.setSection('notify');
    this.closeSidebar();
  }

  navBtnActive(
    section:
      | 'analytics'
      | 'customers'
      | 'driversTable'
      | 'ordersTable'
      | 'drivers'
      | 'orders'
      | 'notify',
    fleetTab?: AdminFleetTabId,
  ): boolean {
    if (this.section() !== section) return false;
    if (section !== 'drivers') return true;
    if (fleetTab == null) return true;
    return this.driverTab() === fleetTab;
  }

  navBtnClass(
    section:
      | 'analytics'
      | 'customers'
      | 'driversTable'
      | 'ordersTable'
      | 'drivers'
      | 'orders'
      | 'notify',
    fleetTab?: AdminFleetTabId,
  ): string {
    const active = this.navBtnActive(section, fleetTab);
    return (
      'admin-nav-btn w-full min-h-[44px] justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ' +
      (active ? '' : 'admin-nav-link-idle')
    );
  }

  onPushTesterToast(e: { message: string; variant: 'success' | 'error' }): void {
    this.toast.show(e.message, e.variant === 'error' ? 'error' : 'success');
  }

  sendScenarioEmail(): void {
    const scenario = this.selectedEmailScenario().trim();
    if (!scenario) {
      this.emailScenarioResult.set('Select a scenario.');
      return;
    }
    this.emailScenarioSending.set(true);
    this.emailScenarioResult.set('');
    this.http
      .post<{ message?: string }>('/api/admin/test/send-email', { scenario })
      .pipe(
        catchError((err) => {
          this.emailScenarioResult.set(extractHttpErrorMessage(err, 'Failed to send test email.'));
          return EMPTY;
        }),
        finalize(() => this.emailScenarioSending.set(false)),
      )
      .subscribe({
        next: (r) => {
          this.emailScenarioResult.set(r?.message ?? 'Email sent.');
        },
      });
  }

  selectOrder(order: AdminOrder): void {
    this.focusedOrderId.set(order._id);
    this.selectedOrder.set(order);
    setTimeout(() => this.logisticsView?.mapResize(), 40);
  }

  setLogisticsTab(tab: AdminLogisticsTabId): void {
    this.selectedLogisticsTab.set(tab);
    this.focusedOrderId.set(null);
    this.selectedOrder.set(null);
    setTimeout(() => this.logisticsView?.mapResize(), 40);
  }

  closeOrderDrawer(): void {
    this.focusedOrderId.set(null);
    this.selectedOrder.set(null);
    setTimeout(() => this.logisticsView?.mapResize(), 40);
  }

  setDriverTab(tab: AdminFleetTabId): void {
    this.driverTab.set(tab);
    this.selectedDriver.set(null);
  }

  selectDriver(driver: AdminUser | PendingVerificationUser): void {
    this.selectedDriver.set(driver);
  }

  openLicensePreview(licenseUrl: string): void {
    if (!licenseUrl) return;
    const fullUrl = this.licenseBaseUrl + licenseUrl;
    const lower = licenseUrl.toLowerCase();
    if (lower.endsWith('.pdf')) {
      window.open(fullUrl, '_blank', 'noopener,noreferrer');
    } else {
      this.vehiclePhotoPreviewUrl.set(null);
      this.licensePreviewUrl.set(fullUrl);
    }
  }

  openVehiclePhotoPreview(vehiclePhotoUrl: string): void {
    if (!vehiclePhotoUrl) return;
    const fullUrl = this.licenseBaseUrl + vehiclePhotoUrl;
    this.licensePreviewUrl.set(null);
    this.vehiclePhotoPreviewUrl.set(fullUrl);
  }

  closeLicensePreview(): void {
    this.licensePreviewUrl.set(null);
  }

  closeVehiclePhotoPreview(): void {
    this.vehiclePhotoPreviewUrl.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.vehiclePhotoPreviewUrl()) {
      this.closeVehiclePhotoPreview();
      return;
    }
    if (this.licensePreviewUrl()) {
      this.closeLicensePreview();
    }
  }

  private applyDriverVerificationLocally(
    id: string,
    status: 'approved' | 'rejected',
    reason?: string,
  ): void {
    this.users.update((list) =>
      list.map((u) => {
        if (u._id !== id) return u;
        if (status === 'approved') {
          return {
            ...u,
            isVerified: true,
            verificationStatus: 'approved',
            rejectionReason: '',
          };
        }
        return {
          ...u,
          isVerified: false,
          verificationStatus: 'rejected',
          rejectionReason: reason ?? '',
        };
      }),
    );
  }

  approveDriver(id: string): void {
    this.verifyingId.set(id);
    this.adminService
      .verifyDriver(id, 'approved')
      .pipe(finalize(() => this.verifyingId.set(null)))
      .subscribe({
        next: (res) => {
          this.applyDriverVerificationLocally(id, 'approved');
          this.selectedDriver.set(null);
          this.toast.show(res.message || 'Driver verified.', 'success');
          this.error.set('');
          this.loadOverview({ silent: true });
        },
        error: () => {},
      });
  }

  /** Opens Material dialog for rejection reason, then PATCH /api/admin/verify-user/:id with { status, reason }. */
  rejectVerification(driver: AdminUser | PendingVerificationUser): void {
    const driverName =
      [driver.firstName, driver.lastName].filter(Boolean).join(' ').trim() || driver.email || 'Driver';
    const data: RejectDriverDialogData = { driverName };
    const ref = this.dialog.open(RejectDriverDialogComponent, {
      width: '440px',
      maxWidth: '95vw',
      data,
      autoFocus: 'first-tabbable',
    });
    ref.afterClosed().subscribe((reason) => {
      if (reason == null || !String(reason).trim()) {
        return;
      }
      const id = driver._id;
      this.verifyingId.set(id);
      this.adminService
        .verifyDriver(id, 'rejected', String(reason).trim())
        .pipe(finalize(() => this.verifyingId.set(null)))
        .subscribe({
          next: (res) => {
            this.applyDriverVerificationLocally(id, 'rejected', String(reason).trim());
            this.selectedDriver.set(null);
            this.toast.show(res.message || 'Driver rejected.', 'success');
            this.error.set('');
            this.loadOverview({ silent: true });
          },
          error: () => {},
        });
    });
  }

  logout(): void {
    this.auth.logout();
  }
}
