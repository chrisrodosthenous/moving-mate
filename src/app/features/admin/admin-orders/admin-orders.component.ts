import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type { AdminOrder } from '../../../core/services/admin.service';
import { UiButtonComponent } from '@/components/ui/button';
import { ADMIN_TABLE_PAGE_SIZE, nextAdminTableVisibleCount } from '../shared/admin-table-pagination';
import { adminTableBadgeClass } from '../shared/admin-table-theme';
import {
  adminOrderFloorsLine,
  adminOrderHasElevator,
  adminOrderLaborBadgeClass,
  adminOrderLaborLabel,
  adminOrderLogisticsSearchBlob,
  adminOrderShowNoLift,
  adminOrderVehicleBadgeClass,
  adminOrderVehicleIcon,
  adminOrderVehicleLabel,
} from '../shared/admin-order-logistics.display';
import { ADMIN_ORDERS_COL_COUNT, ADMIN_ORDERS_TABLE } from '../shared/admin-orders-table.theme';
import {
  customerNameFromOrder,
  driverNameFromOrder,
  formatAdminDateTime,
  matchesSearch,
  orderStatusAdminLabel,
  orderStatusBadgeClass,
  shortOrderId,
} from '../shared/admin-management.utils';

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [DecimalPipe, LucideAngularModule, UiButtonComponent],
  templateUrl: './admin-orders.component.html',
})
export class AdminOrdersComponent {
  readonly orders = input<AdminOrder[]>([]);
  readonly loading = input(false);

  readonly viewOrder = output<AdminOrder>();

  readonly search = signal('');
  readonly visibleCount = signal(ADMIN_TABLE_PAGE_SIZE);
  readonly table = ADMIN_ORDERS_TABLE;
  readonly colCount = ADMIN_ORDERS_COL_COUNT;

  readonly vehicleBadgeClass = adminOrderVehicleBadgeClass;
  readonly vehicleIcon = adminOrderVehicleIcon;
  readonly vehicleLabel = adminOrderVehicleLabel;
  readonly floorsLine = adminOrderFloorsLine;
  readonly laborLabel = adminOrderLaborLabel;
  readonly laborBadgeClass = adminOrderLaborBadgeClass;
  readonly hasElevator = adminOrderHasElevator;
  readonly showNoLift = adminOrderShowNoLift;

  constructor() {
    effect(() => {
      this.search();
      untracked(() => this.visibleCount.set(ADMIN_TABLE_PAGE_SIZE));
    });
  }

  readonly filteredOrders = computed(() => {
    const q = this.search();
    return this.orders().filter((o) => {
      const driver = driverNameFromOrder(o) ?? 'Unassigned';
      const blob = [
        o._id,
        customerNameFromOrder(o),
        driver,
        o.pickupDistrict ?? '',
        o.pickupLocation?.address ?? '',
        o.dropoffLocation?.address ?? '',
        orderStatusAdminLabel(o.status),
        formatAdminDateTime(o.createdAt),
        adminOrderLogisticsSearchBlob(o),
      ].join(' ');
      return matchesSearch(blob, q);
    });
  });

  readonly displayedOrders = computed(() => this.filteredOrders().slice(0, this.visibleCount()));

  readonly hasMore = computed(() => this.visibleCount() < this.filteredOrders().length);

  readonly showingLabel = computed(() => {
    const total = this.filteredOrders().length;
    const shown = this.displayedOrders().length;
    if (total === 0) return '0 transport orders';
    if (shown >= total) return `${total} transport order${total === 1 ? '' : 's'}`;
    return `Showing ${shown} of ${total} orders`;
  });

  loadMore(): void {
    this.visibleCount.set(nextAdminTableVisibleCount(this.visibleCount(), this.filteredOrders().length));
  }

  rowClass(even: boolean): string {
    return `${this.table.trBase} ${even ? this.table.trEven : this.table.trOdd}`;
  }

  badgeClass = adminTableBadgeClass;
  statusClass = orderStatusBadgeClass;
  statusLabel = orderStatusAdminLabel;
  shortId = shortOrderId;
  formatDate = formatAdminDateTime;
  customerName = customerNameFromOrder;
  driverName = driverNameFromOrder;
}
