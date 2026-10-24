import { calculateOrderPrice } from './order-pricing.util';

describe('order-pricing.util', () => {
  it('matches the server 2-bedroom truck reference job', () => {
    const r = calculateOrderPrice({
      vehicleType: 'truck',
      distanceKm: 18,
      cargoInventory: { boxes: 20, mediumItems: 6, largeFurniture: 5, heavyAppliances: 2 },
      pickupFloor: '3',
      destinationFloor: '0',
      hasElevator: false,
      laborRequired: 'driver_plus_helper',
    });
    expect(r.total).toBe(247.44);
    expect(r.pricingBasis).toBe('rate_card');
  });

  it('applies the pickup minimum fare to a trivial job', () => {
    const r = calculateOrderPrice({
      vehicleType: 'pickup',
      distanceKm: 1,
      cargoInventory: { boxes: 0, mediumItems: 0, largeFurniture: 0, heavyAppliances: 0 },
      laborRequired: 'none',
    });
    expect(r.total).toBe(45);
    expect(r.pricingBasis).toBe('minimum_fare');
  });
});
