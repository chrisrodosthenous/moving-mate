import type { TransportOrder } from '../../core/services/orders.service';
import { customerReceiptFigures, driverReceiptFigures } from './driver-move-receipt';

function order(partial: Partial<TransportOrder>): TransportOrder {
  return {
    _id: '6aee27d17dc4bcd3d069db54',
    customerId: 'customer',
    pickupLocation: { address: 'A', lat: 1, lng: 2 },
    dropoffLocation: { address: 'B', lat: 3, lng: 4 },
    status: 'delivered',
    price: 60,
    createdAt: '2026-11-06T19:17:37.000Z',
    ...partial,
  };
}

describe('driverReceiptFigures', () => {
  it('uses the stored payout when the move was delivered', () => {
    const figures = driverReceiptFigures(
      order({ driverEarnings: 48, platformCommission: 12, price: 60 }),
    );
    expect(figures.driverEarnings).toBe(48);
    expect(figures.platformCommission).toBe(12);
    expect(figures.movePrice).toBe(60);
    expect(figures.cancelled).toBe(false);
  });

  it('shows no payout for a cancelled move that was never paid out', () => {
    const figures = driverReceiptFigures(order({ status: 'cancelled', price: 60 }));
    expect(figures.driverEarnings).toBe(0);
    expect(figures.platformCommission).toBe(0);
    expect(figures.cancelled).toBe(true);
  });
});

describe('customerReceiptFigures', () => {
  it('shows the move price as the amount the customer paid', () => {
    const figures = customerReceiptFigures(order({ paymentStatus: 'captured', price: 60 }));
    expect(figures.movePrice).toBe(60);
    expect(figures.amountPaid).toBe(60);
    expect(figures.paymentStatus).toBe('Paid');
    expect(figures.refunded).toBe(false);
  });

  it('shows nothing paid when the payment was refunded', () => {
    const figures = customerReceiptFigures(order({ paymentStatus: 'refunded', price: 60 }));
    expect(figures.amountPaid).toBe(0);
    expect(figures.refunded).toBe(true);
  });
});
