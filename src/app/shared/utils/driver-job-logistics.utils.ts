import { ORDER_FLOOR_OPTIONS } from '../../components/orders/order-form.constants';

import type { TransportOrder } from '../../core/services/orders.service';

import { isLargeTierOrderVehicle, orderVehicleTypeDisplayLabel } from './order-cargo-scoring.util';



export function driverFloorLabel(value: string | undefined | null): string {

  const v = value ?? '0';

  return ORDER_FLOOR_OPTIONS.find((o) => o.value === v)?.label ?? `Floor ${v}`;

}



export function driverVehicleTypeLabel(type: TransportOrder['vehicleType']): string {

  return orderVehicleTypeDisplayLabel(type);

}



export function driverVehicleTypeIcon(type: TransportOrder['vehicleType']): 'truck' | 'container' {
  return isLargeTierOrderVehicle(type) ? 'container' : 'truck';
}



export function driverLaborHelpLabel(labor: TransportOrder['laborRequired']): string | null {

  switch (labor) {

    case 'driver':

      return 'Driver Help Required';

    case 'driver_plus_helper':

      return 'Extra Helper Included';

    default:

      return null;

  }

}



export function driverHasLaborHelp(labor: TransportOrder['laborRequired']): boolean {

  return labor === 'driver' || labor === 'driver_plus_helper';

}



/** Only show warning when customer explicitly declined elevator (not missing on legacy orders). */

export function driverShowNoElevatorWarning(hasElevator: TransportOrder['hasElevator']): boolean {

  return hasElevator === false;

}



export function driverShowElevatorAvailable(hasElevator: TransportOrder['hasElevator']): boolean {

  return hasElevator === true;

}

