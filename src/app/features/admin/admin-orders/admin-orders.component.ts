import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type { AdminOrder } from '../../../core/services/admin.service';
import { AdminService } from '../../../core/services/admin.service';
import { UiButtonComponent } from '@/components/ui/button';
import { ADMIN_TABLE_PAGE_SIZE } from '../shared/admin-table-pagination';
import { adminTableBadgeClass } from '../shared/admin-table-theme';
import {
  adminElevatorAnswer,
  adminOrderFloorsLine,
  adminOrderHasElevator,
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
  readonly loading = input(false);

  readonly search = signal('');
  readonly idFilter = signal('');
  readonly customerFilter = signal('');
  readonly driverFilter = signal('');
  readonly placeFilter = signal('');
  readonly vehicleFilter = signal('all');
  readonly logisticsFilter = signal('');
  readonly priceFilter = signal('');
  readonly createdFilter = signal('');
  readonly statusFilter = signal<'all' | OrderStatusFilter>('all');
  readonly selected = signal<AdminOrder | null>(null);
  readonly loadedOrders = signal<AdminOrder[]>([]);
  readonly resultTotal = signal(0);
  readonly vehicleOptions = signal<string[]>([]);
  readonly listLoading = signal(false);
  readonly table = ADMIN_ORDERS_TABLE;
  readonly colCount = ADMIN_ORDERS_COL_COUNT;
  readonly statusOptions: OrderStatusFilter[] = [
    'Available',
    'Driver is on the way',
    'In Progress',
    'Delivered',
    'Cancelled',
  ];

  readonly vehicleBadgeClass = adminOrderVehicleBadgeClass;
  readonly vehicleIcon = adminOrderVehicleIcon;
  readonly vehicleLabel = adminOrderVehicleLabel;
  readonly floorsLine = adminOrderFloorsLine;
  readonly hasElevator = adminOrderHasElevator;
  readonly elevatorAnswer = adminElevatorAnswer;
  readonly showNoLift = adminOrderShowNoLift;
  private readonly admin = inject(AdminService);
  private requestSeq = 0;

  constructor() {
    effect(() => {
      this.search();
      this.idFilter();
      this.customerFilter();
      this.driverFilter();
      this.placeFilter();
      this.vehicleFilter();
      this.logisticsFilter();
      this.priceFilter();
      this.createdFilter();
      this.statusFilter();
      untracked(() => this.fetchPage(0, false));
    });
  }

  readonly displayedOrders = computed(() => this.loadedOrders());
  readonly hasMore = computed(() => this.loadedOrders().length < this.resultTotal());

  readonly filtersActive = computed(
    () =>
      this.idFilter().trim() !== '' ||
      this.customerFilter().trim() !== '' ||
      this.driverFilter().trim() !== '' ||
      this.placeFilter().trim() !== '' ||
      this.vehicleFilter() !== 'all' ||
      this.logisticsFilter().trim() !== '' ||
      this.priceFilter().trim() !== '' ||
      this.createdFilter().trim() !== '' ||
      this.statusFilter() !== 'all',
  );

  readonly showingLabel = computed(() => {
    const total = this.resultTotal();
    const shown = this.displayedOrders().length;
    if (total === 0) return '0 transport orders';
    if (shown >= total) return `${total} transport order${total === 1 ? '' : 's'}`;
    return `Showing ${shown} of ${total} orders`;
  });

  loadMore(): void {
    this.fetchPage(this.loadedOrders().length, true);
  }

  private fetchPage(offset: number, append: boolean): void {
    const seq = ++this.requestSeq;
    this.listLoading.set(true);
    this.admin
      .listOrders({
        offset,
        limit: ADMIN_TABLE_PAGE_SIZE,
        search: this.search(),
        id: this.idFilter(),
        customer: this.customerFilter(),
        driver: this.driverFilter(),
        place: this.placeFilter(),
        vehicle: this.vehicleFilter(),
        logistics: this.logisticsFilter(),
        price: this.priceFilter(),
        created: this.createdFilter(),
        status: this.statusFilter(),
      })
      .subscribe({
        next: (res) => {
          if (seq !== this.requestSeq) return;
          this.loadedOrders.set(append ? [...this.loadedOrders(), ...res.items] : res.items);
          this.resultTotal.set(res.total);
          this.vehicleOptions.set(res.vehicles ?? []);
          this.listLoading.set(false);
        },
        error: () => {
          if (seq !== this.requestSeq) return;
          this.listLoading.set(false);
        },
      });
  }

  openOrder(order: AdminOrder): void {
    this.selected.set(order);
  }

  closeOrder(): void {
    this.selected.set(null);
  }

  paymentLabel(status: string | undefined): string {
    const value = (status ?? 'unpaid').toLowerCase();
    if (value === 'captured' || value === 'authorized') return 'Paid';
    if (value === 'refunded') return 'Refunded';
    if (value === 'unpaid') return 'Unpaid';
    return status || 'Unpaid';
  }

  personEmail(person: AdminOrder['customer'] | AdminOrder['driver']): string {
    return person?.email?.trim() || '';
  }

  personPhone(person: AdminOrder['customer'] | AdminOrder['driver']): string {
    return person?.phone?.trim() || person?.phoneNumber?.trim() || '';
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

type OrderStatusFilter = 'Available' | 'Driver is on the way' | 'In Progress' | 'Delivered' | 'Cancelled';
