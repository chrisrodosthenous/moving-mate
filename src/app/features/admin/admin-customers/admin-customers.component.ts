import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import type { AdminOrder, AdminUser } from '../../../core/services/admin.service';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { UiButtonComponent } from '@/components/ui/button';
import { ADMIN_TABLE_PAGE_SIZE } from '../shared/admin-table-pagination';
import { ADMIN_TABLE, adminTableBadgeClass } from '../shared/admin-table-theme';
import {
  customerAccountStatus,
  fullName,
  orderStatusAdminLabel,
  orderStatusBadgeClass,
} from '../shared/admin-management.utils';
import { orderShortId } from '../../../shared/utils/order-utils';

export interface AdminCustomerRow {
  user: AdminUser;
  fullName: string;
  email: string;
  phone: string;
  district: string;
  totalOrders: number;
  status: ReturnType<typeof customerAccountStatus>;
}

@Component({
  selector: 'app-admin-customers',
  standalone: true,
  imports: [DatePipe, DecimalPipe, UiButtonComponent],
  templateUrl: './admin-customers.component.html',
})
export class AdminCustomersComponent {
  readonly orders = input<AdminOrder[]>([]);
  readonly loading = input(false);

  readonly suspensionChanged = output<AdminUser>();

  readonly search = signal('');
  readonly nameFilter = signal('');
  readonly contactFilter = signal('');
  readonly districtFilter = signal('all');
  readonly ordersFilter = signal('');
  readonly statusFilter = signal<'all' | 'Active' | 'Suspended'>('all');
  readonly selected = signal<AdminCustomerRow | null>(null);
  readonly loadedRows = signal<AdminCustomerRow[]>([]);
  readonly resultTotal = signal(0);
  readonly districtOptions = signal<string[]>([]);
  readonly listLoading = signal(false);
  readonly table = ADMIN_TABLE;
  readonly pageSize = ADMIN_TABLE_PAGE_SIZE;
  readonly orderStatusLabel = orderStatusAdminLabel;
  readonly orderStatusClass = orderStatusBadgeClass;
  readonly shortId = orderShortId;
  readonly suspensionBusy = signal(false);
  readonly impersonating = signal(false);
  readonly impersonateError = signal('');
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private requestSeq = 0;

  constructor() {
    effect(() => {
      this.search();
      this.nameFilter();
      this.contactFilter();
      this.districtFilter();
      this.ordersFilter();
      this.statusFilter();
      untracked(() => this.fetchPage(0, false));
    });
  }

  readonly displayedRows = computed(() => this.loadedRows());

  readonly hasMore = computed(() => this.loadedRows().length < this.resultTotal());

  readonly selectedOrders = computed(() => {
    const customer = this.selected();
    if (!customer) return [];
    const id = String(customer.user._id);
    return this.orders().filter((order) => {
      const customerId =
        order.customerId && typeof order.customerId === 'object'
          ? String(order.customerId._id ?? '')
          : String(order.customerId ?? '');
      return customerId === id;
    });
  });

  readonly filtersActive = computed(
    () =>
      this.nameFilter().trim() !== '' ||
      this.contactFilter().trim() !== '' ||
      this.districtFilter() !== 'all' ||
      this.ordersFilter().trim() !== '' ||
      this.statusFilter() !== 'all',
  );

  readonly showingLabel = computed(() => {
    const total = this.resultTotal();
    const shown = this.displayedRows().length;
    if (total === 0) return '0 registered customers';
    if (shown >= total) return `${total} registered customer${total === 1 ? '' : 's'}`;
    return `Showing ${shown} of ${total} customers`;
  });

  loadMore(): void {
    this.fetchPage(this.loadedRows().length, true);
  }

  private fetchPage(offset: number, append: boolean): void {
    const seq = ++this.requestSeq;
    this.listLoading.set(true);
    this.admin
      .listCustomers({
        offset,
        limit: ADMIN_TABLE_PAGE_SIZE,
        search: this.search(),
        name: this.nameFilter(),
        contact: this.contactFilter(),
        district: this.districtFilter(),
        orders: this.ordersFilter(),
        status: this.statusFilter(),
      })
      .subscribe({
        next: (res) => {
          if (seq !== this.requestSeq) return;
          const mapped = res.items.map((item) => this.toRow(item));
          this.loadedRows.set(append ? [...this.loadedRows(), ...mapped] : mapped);
          this.resultTotal.set(res.total);
          this.districtOptions.set(res.districts ?? []);
          this.listLoading.set(false);
        },
        error: () => {
          if (seq !== this.requestSeq) return;
          this.listLoading.set(false);
        },
      });
  }

  private toRow(item: AdminUser & { totalOrders?: number; districtLabel?: string; fullName?: string }): AdminCustomerRow {
    const user = item;
    return {
      user,
      fullName: item.fullName || fullName(user),
      email: user.email,
      phone: user.phoneNumber,
      district: item.districtLabel || '—',
      totalOrders: item.totalOrders ?? 0,
      status: customerAccountStatus(user),
    };
  }

  openCustomer(row: AdminCustomerRow): void {
    this.impersonateError.set('');
    this.selected.set(row);
  }

  closeCustomer(): void {
    this.selected.set(null);
  }

  toggleSuspension(row: AdminCustomerRow): void {
    if (this.suspensionBusy()) return;
    const suspended = !row.user.isSuspended;
    this.suspensionBusy.set(true);
    this.admin.setCustomerSuspension(row.user._id, suspended).subscribe({
      next: (res) => {
        const user = { ...row.user, ...res.user, isSuspended: suspended };
        this.selected.set({
          ...row,
          user,
          status: customerAccountStatus(user),
        });
        this.loadedRows.update((rows) =>
          rows.map((item) =>
            item.user._id === user._id ? { ...item, user, status: customerAccountStatus(user) } : item,
          ),
        );
        this.suspensionChanged.emit(user);
        this.suspensionBusy.set(false);
      },
      error: () => this.suspensionBusy.set(false),
    });
  }

  impersonate(row: AdminCustomerRow): void {
    if (this.impersonating()) return;
    const preview = window.open('', '_blank');
    if (!preview) {
      this.impersonateError.set('Allow pop-ups to open this account in a new tab.');
      return;
    }
    this.impersonateError.set('');
    this.impersonating.set(true);
    this.writeSigningIn(preview);
    this.admin.impersonate(row.user._id).subscribe({
      next: (res) => {
        this.auth.openImpersonatedTab(res.code, preview);
        this.impersonating.set(false);
      },
      error: (err: HttpErrorResponse) => {
        preview.close();
        const message = err.error?.message;
        this.impersonateError.set(typeof message === 'string' ? message : 'Could not sign in as this customer.');
        this.impersonating.set(false);
      },
    });
  }

  private writeSigningIn(preview: Window): void {
    try {
      preview.document.title = 'Moving Mate';
      preview.document.body.textContent = 'Signing you in…';
    } catch {
      /* The blank tab can still navigate once the account is ready. */
    }
  }

  badgeClass = adminTableBadgeClass;
}
