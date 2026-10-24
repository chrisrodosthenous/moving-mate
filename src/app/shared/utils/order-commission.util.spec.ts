import { computeOrderCommission, computeDriverNetEarnings } from './order-commission.util';

describe('order-commission.util', () => {
  it('keeps the first €100 at 20%', () => {
    const r = computeOrderCommission(100);
    expect(r.platformCommission).toBe(20);
    expect(r.driverEarnings).toBe(80);
  });

  it('walks the 2-bedroom total through the second band', () => {
    const r = computeOrderCommission(247.44);
    expect(r.platformCommission).toBe(42.12);
    expect(r.driverEarnings).toBe(205.32);
    expect(computeDriverNetEarnings(247.44)).toBe(205.32);
  });
});
