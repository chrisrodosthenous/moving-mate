import { ORDER_FLOOR_OPTIONS } from '../../../components/orders/order-form.constants';
import type { AdminOrder } from '../../../core/services/admin.service';
import {
  isLargeTierOrderVehicle,
  orderVehicleTypeDisplayLabel,
} from '../../../shared/utils/order-cargo-scoring.util';

function floorLabel(value: string | undefined | null): string {
  const v = value ?? '0';
  return ORDER_FLOOR_OPTIONS.find((o) => o.value === v)?.label ?? `Floor ${v}`;
}

export function adminOrderFloorsLine(order: AdminOrder): string {
  const from = floorLabel(order.pickupFloor);
  const to = floorLabel(order.destinationFloor);
  return `Floor: ${from} → ${to}`;
}

export function adminOrderVehicleLabel(vehicleType: AdminOrder['vehicleType']): string {
  return orderVehicleTypeDisplayLabel(vehicleType);
}

export function adminOrderVehicleIcon(vehicleType: AdminOrder['vehicleType']): 'truck' | 'container' {
  return isLargeTierOrderVehicle(vehicleType) ? 'container' : 'truck';
}

export function adminOrderVehicleBadgeClass(vehicleType: AdminOrder['vehicleType']): string {
  const base = 'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap';
  if (isLargeTierOrderVehicle(vehicleType)) {
    return `${base} border-primary/20 bg-primary/10 text-primary`;
  }
  return `${base} border-border/30 bg-secondary/30 text-foreground`;
}

export function adminElevatorAnswer(order: AdminOrder, side: 'pickup' | 'dropoff'): string {
  const specific = side === 'pickup' ? order.pickupHasElevator : order.dropoffHasElevator;
  if (specific === true) return 'Yes';
  if (specific === false) return 'No';
  if (order.hasElevator === true) return 'Yes';
  if (order.hasElevator === false) return 'No';
  return 'Not recorded';
}

export function adminOrderHasElevator(order: AdminOrder): boolean {
  return order.hasElevator === true;
}

export function adminOrderShowNoLift(order: AdminOrder): boolean {
  return order.hasElevator === false;
}

export function adminOrderLogisticsSearchBlob(order: AdminOrder): string {
  return [
    adminOrderVehicleLabel(order.vehicleType),
    adminOrderFloorsLine(order),
    order.hasElevator === true ? 'elevator' : order.hasElevator === false ? 'no lift' : '',
  ].join(' ');
}
