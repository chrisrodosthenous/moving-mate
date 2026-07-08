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
    return `${base} border-[#7BBDE8]/20 bg-[#7BBDE8]/10 text-[#7BBDE8]`;
  }
  return `${base} border-[#49769F]/30 bg-[#49769F]/10 text-[#BDD8E9]`;
}

export function adminOrderLaborLabel(labor: AdminOrder['laborRequired']): string {
  switch (labor) {
    case 'driver':
      return 'Driver Helps';
    case 'driver_plus_helper':
      return 'Driver + 1 Helper';
    default:
      return 'Driver Only';
  }
}

export function adminOrderLaborBadgeClass(labor: AdminOrder['laborRequired']): string {
  const base = 'inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap';
  switch (labor) {
    case 'driver':
      return `${base} border border-[#7BBDE8]/25 bg-[#7BBDE8]/10 text-[#7BBDE8]`;
    case 'driver_plus_helper':
      return `${base} border-2 border-[#7BBDE8]/50 bg-[#7BBDE8]/15 text-[#7BBDE8] shadow-[0_0_8px_rgba(123,189,232,0.2)]`;
    default:
      return `${base} text-[#BDD8E9]/55`;
  }
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
    adminOrderLaborLabel(order.laborRequired),
    order.hasElevator === true ? 'elevator' : order.hasElevator === false ? 'no lift' : '',
  ].join(' ');
}
