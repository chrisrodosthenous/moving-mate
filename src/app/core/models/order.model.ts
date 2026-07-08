/**
 * Shared order logistics types — single source of truth for client, driver, admin, and API payloads.
 *
 * Note: API / MongoDB store extra helper labor as `driver_plus_helper` (not `driver_helper`).
 */

export type OrderVehicleType = 'pickup' | 'minivan' | 'van' | 'truck';

/** Legacy values may still appear on older orders in MongoDB. */
export type LegacyOrderVehicleType = 'small' | 'large';

/** Current or legacy vehicle type as stored on orders from the API. */
export type StoredOrderVehicleType = OrderVehicleType | LegacyOrderVehicleType;

export type OrderLaborRequired = 'none' | 'driver' | 'driver_plus_helper';

/** Customer cargo inventory — drives automatic vehicle tier selection. */
export interface OrderCargoInventory {
  boxes: number;
  mediumItems: number;
  largeFurniture: number;
  heavyAppliances: number;
}

/** Logistics fields captured on the New Order form and persisted on every new transport order. */
export interface OrderLogistics {
  vehicleType: OrderVehicleType;
  pickupFloor: string;
  destinationFloor: string;
  hasElevator: boolean;
  laborRequired: OrderLaborRequired;
  cargoInventory?: OrderCargoInventory;
}

/** Defaults aligned with {@link CreateOrderComponent} logisticsForm. */
export const DEFAULT_ORDER_LOGISTICS: Readonly<OrderLogistics> = {
  vehicleType: 'pickup',
  pickupFloor: '0',
  destinationFloor: '0',
  hasElevator: false,
  laborRequired: 'none',
  cargoInventory: { boxes: 0, mediumItems: 0, largeFurniture: 0, heavyAppliances: 0 },
};

/** Partial logistics on reads — older orders may omit fields until backfilled. */
export type OrderLogisticsPartial = Partial<OrderLogistics>;
