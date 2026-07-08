import { Component, computed, effect, inject, signal, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { map } from 'rxjs/operators';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TransportOrder, ORDERS_API_BASE } from '../../../core/services/orders.service';
import { LoggerService } from '../../../core/services/logger.service';
import * as DriverActions from '../state/driver.actions';
import {
  selectDriverMyLoading,
  selectDriverMyOrders,
  selectDriverTripBusyId,
  selectDriverTripStatusError,
} from '../state/driver.selectors';
import { AuthStore } from '../../../store/auth.store';
import { UiButtonComponent } from '@/components/ui/button';

import { OrderRoutePreviewDialogComponent } from '../../../shared/components/order-route-preview-dialog/order-route-preview-dialog.component';
import { orderVehicleTypeDisplayLabel } from '../../../shared/utils/order-cargo-scoring.util';

const ACTIVE_JOB_STATUSES = new Set(['accepted', 'in_progress', 'picked_up', 'driver_is_on_the_way']);

function driverCustomerName(order: TransportOrder): string {
  const c = order.customerId;
  if (!c || typeof c !== 'object') return '—';
  const parts = [c.firstName, c.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  if (c.name) return c.name;
  return '—';
}

@Component({
  selector: 'app-driver-job-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe, UiButtonComponent, OrderRoutePreviewDialogComponent],
  templateUrl: './driver-job-detail.component.html',
  styleUrl: './driver-job-detail.component.css',
})
export class DriverJobDetailComponent implements OnInit {
  readonly vehicleTypeLabel = orderVehicleTypeDisplayLabel;

  cargoInventorySummary(order: TransportOrder): string {
    const inv = order.cargoInventory;
    if (inv) {
      return `${inv.boxes} boxes, ${inv.mediumItems} medium items, ${inv.largeFurniture} large furniture, ${inv.heavyAppliances} heavy appliances`;
    }
    return `${order.smallBoxes ?? 0} small, ${order.mediumBoxes ?? 0} medium, ${order.largeBoxes ?? 0} large`;
  }

  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly logger = inject(LoggerService);

  readonly routePreviewOrder = signal<TransportOrder | null>(null);

  readonly myOrders = toSignal(this.store.select(selectDriverMyOrders), { initialValue: [] });
  readonly loading = toSignal(this.store.select(selectDriverMyLoading), { initialValue: true });
  readonly tripBusyId = toSignal(this.store.select(selectDriverTripBusyId), { initialValue: null });
  readonly tripStatusError = toSignal(this.store.select(selectDriverTripStatusError), {
    initialValue: null,
  });

  readonly orderId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('orderId') ?? '')),
    { initialValue: '' },
  );

  readonly order = computed(() => {
    const id = this.orderId();
    if (!id) return null;
    return this.myOrders().find((o) => String(o._id) === id) ?? null;
  });

  readonly notFound = computed(() => {
    if (!this.orderId()) return false;
    if (this.loading()) return false;
    return this.order() == null;
  });

  constructor() {
    effect(() => {
      if (this.loading()) return;
      const o = this.order();
      if (!o) return;
      if (!this.auth.isDriverVerificationRejected()) return;
      if (ACTIVE_JOB_STATUSES.has(o.status)) {
        void this.router.navigate(['/driver/tasks']);
      }
    });
  }

  ngOnInit(): void {
    this.store.dispatch(DriverActions.loadDriverMyOrders({}));
  }

  customerName(order: TransportOrder): string {
    return driverCustomerName(order);
  }

  submissionDateIso(order: TransportOrder): string {
    return order.submittedAt ?? order.createdAt;
  }

  cargoImageUrl(order: TransportOrder): string {
    return order.cargoImageUrl ? ORDERS_API_BASE + order.cargoImageUrl : '';
  }

  customerDialPhone(order: TransportOrder): string | undefined {
    const c = order.customerId;
    if (!c || typeof c !== 'object') return undefined;
    return c.phone ?? c.phoneNumber ?? undefined;
  }

  displayStatus(status: string): string {
    if (
      status === 'picked_up' ||
      status === 'driver_is_on_the_way' ||
      status === 'in_progress'
    ) {
      return 'In progress';
    }
    if (status === 'delivered') return 'Completed';
    if (status === 'accepted') return 'Accepted';
    return status || '—';
  }

  canShowMarkPickedUp(order: TransportOrder): boolean {
    return order.status === 'accepted';
  }

  canShowMarkDelivered(order: TransportOrder): boolean {
    const s = order.status;
    return s === 'driver_is_on_the_way' || s === 'picked_up' || s === 'in_progress';
  }

  isTripBusy(id: string): boolean {
    return this.tripBusyId() === id;
  }

  startDelivery(id: string): void {
    this.store.dispatch(DriverActions.updateDriverTripStatus({ id, status: 'in-transit' }));
  }

  markCompleted(id: string): void {
    this.store.dispatch(DriverActions.updateDriverTripStatus({ id, status: 'completed' }));
  }

  viewRoute(order: TransportOrder, event?: Event): void {
    event?.stopPropagation();
    this.routePreviewOrder.set(order);
    this.logger.log('DriverJobDetail: route preview', String(order._id));
  }

  closeRoutePreview(): void {
    this.routePreviewOrder.set(null);
  }
}
