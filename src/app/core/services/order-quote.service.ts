import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import type {
  OrderCargoInventory,
  OrderLaborRequired,
  OrderVehicleType,
} from '../models/order.model';
import type { OrderPriceBreakdown } from '../../shared/utils/order-pricing.util';
import { httpOptionsSkipGlobalErrorToast } from '../http/http-error-context';

export interface OrderQuoteRequest {
  distanceKm: number;
  cargoInventory: OrderCargoInventory;
  pickupFloor: string;
  destinationFloor: string;
  hasElevator: boolean;
  laborRequired: OrderLaborRequired;
}

export interface OrderQuote {
  breakdown: OrderPriceBreakdown;
  /** Tier the server derived from the cargo; authoritative over any local guess. */
  vehicleType: OrderVehicleType;
  cargoScore: number;
  driverEarnings: number;
  commissionRate: number;
  /** Signed proof of the quoted price; replayed on order creation. */
  quoteToken: string;
  expiresAt: string;
}

/**
 * Prices an in-progress order.
 *
 * The server owns the pricing formula, so the form asks for a quote instead of computing
 * one. The returned token is what order creation submits, which is why the customer is
 * charged the price they were shown even if pricing config changes mid-session.
 */
@Injectable({ providedIn: 'root' })
export class OrderQuoteService {
  private readonly http = inject(HttpClient);

  /** Errors are surfaced inline next to the price, so the global toast is suppressed. */
  quote(request: OrderQuoteRequest): Observable<OrderQuote> {
    return this.http.post<OrderQuote>(
      '/api/orders/quote',
      request,
      httpOptionsSkipGlobalErrorToast(),
    );
  }
}
