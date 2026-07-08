import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import type { AdminOrder, AdminUser } from '../../../core/services/admin.service';
import { UiButtonComponent } from '@/components/ui/button';
import { ADMIN_TABLE_PAGE_SIZE, nextAdminTableVisibleCount } from '../shared/admin-table-pagination';
import { ADMIN_TABLE, adminTableBadgeClass } from '../shared/admin-table-theme';
import {
  countCustomerOrders,
  customerAccountStatus,
  customerDistrict,
  fullName,
  matchesSearch,
} from '../shared/admin-management.utils';

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
  imports: [UiButtonComponent],
  templateUrl: './admin-customers.component.html',
})
export class AdminCustomersComponent {
  readonly users = input<AdminUser[]>([]);
  readonly orders = input<AdminOrder[]>([]);
  readonly loading = input(false);

  readonly viewCustomer = output<AdminUser>();

  readonly search = signal('');
  readonly visibleCount = signal(ADMIN_TABLE_PAGE_SIZE);
  readonly table = ADMIN_TABLE;
  readonly pageSize = ADMIN_TABLE_PAGE_SIZE;

  constructor() {
    effect(() => {
      this.search();
      untracked(() => this.visibleCount.set(ADMIN_TABLE_PAGE_SIZE));
    });
  }

  readonly rows = computed((): AdminCustomerRow[] => {
    const orders = this.orders();
    return this.users()
      .filter((u) => u.role === 'customer')
      .map((user) => ({
        user,
        fullName: fullName(user),
        email: user.email,
        phone: user.phoneNumber,
        district: customerDistrict(user),
        totalOrders: countCustomerOrders(user._id, orders),
        status: customerAccountStatus(user),
      }));
  });

  readonly filteredRows = computed(() => {
    const q = this.search();
    return this.rows().filter((r) => {
      const blob = [r.fullName, r.email, r.phone, r.district, r.status.label].join(' ');
      return matchesSearch(blob, q);
    });
  });

  readonly displayedRows = computed(() => this.filteredRows().slice(0, this.visibleCount()));

  readonly hasMore = computed(() => this.visibleCount() < this.filteredRows().length);

  readonly showingLabel = computed(() => {
    const total = this.filteredRows().length;
    const shown = this.displayedRows().length;
    if (total === 0) return '0 registered customers';
    if (shown >= total) return `${total} registered customer${total === 1 ? '' : 's'}`;
    return `Showing ${shown} of ${total} customers`;
  });

  loadMore(): void {
    this.visibleCount.set(nextAdminTableVisibleCount(this.visibleCount(), this.filteredRows().length));
  }

  badgeClass = adminTableBadgeClass;
}
