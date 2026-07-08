/** Driver vehicle categories — distinct from customer order `small` / `large` van sizing. */
export type DriverVehicleType = 'pickup' | 'minivan' | 'van' | 'truck';

export interface Driver {
  vehicleType: DriverVehicleType;
  vehiclePhotoUrl?: string;
  isVerified: boolean;
}

export const DRIVER_VEHICLE_OPTIONS: ReadonlyArray<{
  value: DriverVehicleType;
  label: string;
}> = [
  { value: 'pickup', label: 'Pickup (small items / boxes)' },
  { value: 'minivan', label: 'Mini Van (medium loads / many boxes)' },
  { value: 'van', label: 'Van (large furniture & appliances)' },
  { value: 'truck', label: 'Truck (full moves / heavy items)' },
] as const;

export function driverVehicleTypeLabel(type: DriverVehicleType | string | undefined | null): string {
  const found = DRIVER_VEHICLE_OPTIONS.find((o) => o.value === type);
  return found?.label ?? '—';
}
