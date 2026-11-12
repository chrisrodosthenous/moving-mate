import { ORDER_FLOOR_OPTIONS } from '../../components/orders/order-form.constants';

import type { TransportOrder } from '../../core/services/orders.service';

import { orderVehicleTypeDisplayLabel } from './order-cargo-scoring.util';



export function driverFloorLabel(value: string | undefined | null): string {

  const v = value ?? '0';

  return ORDER_FLOOR_OPTIONS.find((o) => o.value === v)?.label ?? `Floor ${v}`;

}



export function driverVehicleTypeLabel(type: TransportOrder['vehicleType']): string {

  return orderVehicleTypeDisplayLabel(type);

}



export function driverVehicleTypeIcon(
  type: TransportOrder['vehicleType'],
): 'car' | 'bus' | 'van' | 'truck' {
  switch (String(type ?? '').toLowerCase()) {
    case 'van':
      return 'van';
    case 'truck':
    case 'large':
      return 'truck';
    case 'minivan':
      return 'bus';
    default:
      return 'car';
  }
}



/** Only show warning when customer explicitly declined elevator (not missing on legacy orders). */

export function driverShowNoElevatorWarning(hasElevator: TransportOrder['hasElevator']): boolean {

  return hasElevator === false;

}



export function driverShowElevatorAvailable(hasElevator: TransportOrder['hasElevator']): boolean {

  return hasElevator === true;

}

