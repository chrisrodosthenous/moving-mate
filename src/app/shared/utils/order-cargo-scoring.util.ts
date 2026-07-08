import type {
  OrderCargoInventory,
  OrderVehicleType,
  StoredOrderVehicleType,
} from '../../core/models/order.model';

/** Any vehicle type value from forms, API payloads, or legacy MongoDB documents. */
export type OrderVehicleTypeInput = StoredOrderVehicleType | string | undefined | null;

/** Point weights per inventory category (business rules). */
export const CARGO_INVENTORY_SCORES: Readonly<Record<keyof OrderCargoInventory, number>> = {
  boxes: 1,
  mediumItems: 4,
  largeFurniture: 10,
  heavyAppliances: 12,
};

export const CARGO_INVENTORY_CATEGORIES: ReadonlyArray<{
  key: keyof OrderCargoInventory;
  title: string;
  subtitle: string;
}> = [
  {
    key: 'boxes',
    title: 'Boxes / Small Items',
    subtitle: 'Small boxes and loose items',
  },
  {
    key: 'mediumItems',
    title: 'Medium Items / Furniture',
    subtitle: 'e.g. washing machine, chairs, small table',
  },
  {
    key: 'largeFurniture',
    title: 'Large Furniture',
    subtitle: 'e.g. sofa, bed, wardrobe',
  },
  {
    key: 'heavyAppliances',
    title: 'Heavy / Large Appliances',
    subtitle: 'e.g. fridge, double-door fridge',
  },
];

export const EMPTY_CARGO_INVENTORY: OrderCargoInventory = {
  boxes: 0,
  mediumItems: 0,
  largeFurniture: 0,
  heavyAppliances: 0,
};

export function normalizeCargoQuantity(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function totalCargoItems(inventory: OrderCargoInventory): number {
  return (
    inventory.boxes +
    inventory.mediumItems +
    inventory.largeFurniture +
    inventory.heavyAppliances
  );
}

export function computeCargoScore(inventory: OrderCargoInventory): number {
  return (
    inventory.boxes * CARGO_INVENTORY_SCORES.boxes +
    inventory.mediumItems * CARGO_INVENTORY_SCORES.mediumItems +
    inventory.largeFurniture * CARGO_INVENTORY_SCORES.largeFurniture +
    inventory.heavyAppliances * CARGO_INVENTORY_SCORES.heavyAppliances
  );
}

/** Strict tier rules: 0–5 pickup, 6–15 minivan, 16–35 van, 36+ truck. */
export function vehicleTypeFromCargoScore(score: number): OrderVehicleType {
  if (score <= 5) return 'pickup';
  if (score <= 15) return 'minivan';
  if (score <= 35) return 'van';
  return 'truck';
}

export function vehicleTypeFromCargoInventory(inventory: OrderCargoInventory): OrderVehicleType {
  return vehicleTypeFromCargoScore(computeCargoScore(inventory));
}

export interface VehicleRecommendationCopy {
  vehicleType: OrderVehicleType;
  icon: 'truck' | 'container';
  message: string;
}

export function vehicleRecommendationCopy(type: OrderVehicleType): VehicleRecommendationCopy {
  switch (type) {
    case 'pickup':
      return {
        vehicleType: 'pickup',
        icon: 'truck',
        message:
          'Recommended vehicle: Pickup. Ideal for 2–4 small boxes or very small items.',
      };
    case 'minivan':
      return {
        vehicleType: 'minivan',
        icon: 'truck',
        message:
          'Recommended vehicle: Mini Van. Suitable for many boxes or one medium piece of furniture.',
      };
    case 'van':
      return {
        vehicleType: 'van',
        icon: 'container',
        message:
          'Recommended vehicle: Van. Required for large furniture (sofa/bed) and household appliances.',
      };
    case 'truck':
      return {
        vehicleType: 'truck',
        icon: 'container',
        message:
          'Recommended vehicle: Truck. Required for full moves or heavy, bulky loads.',
      };
    default:
      return {
        vehicleType: 'pickup',
        icon: 'truck',
        message: 'Recommended vehicle: Pickup.',
      };
  }
}

/** Van, truck, or legacy "large" tier (string check avoids TS2367 on narrowed unions). */
export function isLargeTierOrderVehicle(type: OrderVehicleTypeInput): boolean {
  const v = String(type ?? '').toLowerCase();
  return v === 'van' || v === 'truck' || v === 'large';
}

/** Display label for order vehicle type (supports legacy small/large). */
export function orderVehicleTypeDisplayLabel(type: OrderVehicleTypeInput): string {
  switch (type) {
    case 'pickup':
      return 'Pickup';
    case 'minivan':
      return 'Mini Van';
    case 'van':
      return 'Van';
    case 'truck':
      return 'Truck';
    case 'small':
      return 'Small Van / Pickup';
    case 'large':
      return 'Large Van (Transit)';
    default:
      return '—';
  }
}
