import {
  computeCargoScore,
  vehicleTypeFromCargoScore,
  vehicleTypeFromCargoInventory,
} from './order-cargo-scoring.util';

describe('order-cargo-scoring.util', () => {
  it('uses the same band edges as the server', () => {
    expect(vehicleTypeFromCargoScore(5)).toBe('pickup');
    expect(vehicleTypeFromCargoScore(6)).toBe('minivan');
    expect(vehicleTypeFromCargoScore(16)).toBe('van');
    expect(vehicleTypeFromCargoScore(36)).toBe('truck');
  });

  it('scores the 2-bedroom reference load as a truck', () => {
    const inv = { boxes: 20, mediumItems: 6, largeFurniture: 5, heavyAppliances: 2 };
    expect(computeCargoScore(inv)).toBe(118);
    expect(vehicleTypeFromCargoInventory(inv)).toBe('truck');
  });
});
