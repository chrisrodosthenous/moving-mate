import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { HttpToastControl } from '../http/http-error-context';
import { httpOptionsSkipGlobalErrorToast } from '../http/http-error-context';
import type {
  OrderCargoInventory,
  OrderLaborRequired,
  OrderLogistics,
  OrderLogisticsPartial,
  OrderVehicleType,
  StoredOrderVehicleType,
} from '../models/order.model';

export type { OrderLaborRequired, OrderLogistics, OrderLogisticsPartial, OrderVehicleType, OrderCargoInventory } from '../models/order.model';

const API_URL = '/api/orders';
/** Same-origin base for static upload paths (e.g. `/uploads/...`); dev proxy forwards `/uploads`. */
export const ORDERS_API_BASE = '';

export interface LocationData {
  address: string;
  lat: number;
  lng: number;
}

export interface TransportOrder {
  _id: string;
  customerId:
    | { _id?: string; name?: string; firstName?: string; lastName?: string; phone?: string; phoneNumber?: string }
    | string;
  driverId?:
    | {
        _id?: string;
        name?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        phoneNumber?: string;
      }
    | string;
  pickupDistrict?: string;
  pickupLocation: LocationData;
  dropoffLocation: LocationData;
  status: string;
  price: number;
  /** Customer payment lifecycle (authorize on checkout, capture on driver accept). */
  paymentStatus?: 'unpaid' | 'authorized' | 'captured' | 'refunded';
  /** Driver net payout after platform commission (set when delivered). */
  driverEarnings?: number;
  platformCommission?: number;
  commissionRate?: number;
  distanceKm?: number;
  unreadCount?: number;
  hasReview?: boolean;
  insuranceStatus?: boolean;
  scheduledAt?: string;
  smallBoxes?: number;
  mediumBoxes?: number;
  largeBoxes?: number;
  /** Logistics (optional on legacy orders). */
  vehicleType?: StoredOrderVehicleType;
  cargoInventory?: OrderCargoInventory;
  pickupFloor?: string;
  destinationFloor?: string;
  hasElevator?: boolean;
  laborRequired?: OrderLaborRequired;
  /** Relative or absolute URL to cargo photo (set after upload). */
  cargoImageUrl?: string;
  /** ISO date when the order was submitted (mirrors `createdAt` when provided by API). */
  submittedAt?: string;
  /** Denormalized driver display name for customer UIs (optional; may be derived from populated `driverId`). */
  assignedDriverName?: string;
  rating?: number | null;
  review?: string | null;
  createdAt: string;
  /** Latest driver GPS persisted by the server (optional; complements live sockets). */
  driverLocation?: {
    lat: number;
    lng: number;
    heading?: number;
    updatedAt?: string;
  };
}

export interface CreateOrderPayload extends OrderLogistics {
  pickupLocation: LocationData;
  dropoffLocation: LocationData;
  /** Cyprus district where pickup is located (must match server enum). */
  pickupDistrict: string;
  price: number;
  /** Optional; sent when route distance is known (matches React NewOrder). */
  distanceKm?: number;
  cargoInventory: OrderCargoInventory;
  /** Legacy box columns — derived from inventory for backward-compatible APIs. */
  smallBoxes: number;
  mediumBoxes: number;
  largeBoxes: number;
  insuranceStatus?: boolean;
  scheduledAt?: string;
}

export interface OrderSummaryCustomer {
  total: number;
  pending: number;
  accepted: number;
}

export interface OrderSummaryDriver {
  available: number;
  accepted: number;
}

function opt(opts?: HttpToastControl): ReturnType<typeof httpOptionsSkipGlobalErrorToast> | Record<string, never> {
  return opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
}

export interface GetAvailableOrdersOpts extends HttpToastControl {
  limit?: number;
  offset?: number;
}

export interface AvailableOrdersListResponse {
  orders: TransportOrder[];
  total: number;
}

export interface GetMyOrdersOpts extends HttpToastControl {
  /** `summary` trims server fields (see API); `full` returns full documents after population. */
  view?: 'full' | 'summary';
  limit?: number;
  offset?: number;
  /**
   * Server filters: `completed` = delivered/cancelled; `active` = everything else.
   * Omit for chronological “all my orders” (default My Orders active tab + mixed pagination).
   */
  scope?: 'completed' | 'active';
}

export interface MyOrdersListResponse {
  orders: TransportOrder[];
  total: number;
}

/** HTTP client for orders API: create, list available, my orders, update status, complete, summary. */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  constructor(private http: HttpClient) {}

  createOrder(payload: CreateOrderPayload, opts?: HttpToastControl): Observable<TransportOrder> {
    return this.http.post<TransportOrder>(API_URL, payload, opt(opts));
  }

  /**
   * Customer cancel pending order — PATCH /cancel, with PUT status fallback (React MyOrders parity).
   */
  cancelOrder(id: string, opts?: HttpToastControl): Observable<TransportOrder> {
    const h = opt(opts);
    return this.http.patch<TransportOrder>(`${API_URL}/${id}/cancel`, {}, h).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404) {
          return this.http.put<TransportOrder>(`${API_URL}/${id}`, { status: 'cancelled' }, h);
        }
        return throwError(() => err);
      }),
    );
  }

  /** Upload cargo photo for a pending order (customer). */
  uploadOrderCargo(orderId: string, file: File, opts?: HttpToastControl): Observable<TransportOrder> {
    const formData = new FormData();
    formData.append('cargo', file);
    return this.http.post<TransportOrder>(`${API_URL}/${orderId}/cargo`, formData, opt(opts));
  }

  /**
   * Driver/admin: GET /api/orders — pending jobs in driver districts.
   * With `limit`, response is `{ orders, total }`; otherwise a plain array (legacy).
   */
  getOrders(opts?: GetAvailableOrdersOpts): Observable<TransportOrder[] | AvailableOrdersListResponse> {
    const limit = opts?.limit;
    const offset = opts?.offset;
    let params = new HttpParams();
    if (limit != null && Number.isFinite(limit)) {
      params = params.set('limit', String(Math.floor(limit)));
    }
    if (offset != null && Number.isFinite(offset) && offset > 0) {
      params = params.set('offset', String(Math.floor(offset)));
    }
    const base = opt(opts);
    const extra = params.keys().length ? { params } : {};
    return this.http.get<TransportOrder[] | AvailableOrdersListResponse>(API_URL, { ...base, ...extra });
  }

  /**
   * GET /api/orders/mine — returns `{ orders, total }`.
   * Pass `view: 'summary'` and `limit` / `offset` for list views; omit for full unbounded payload (driver/dashboard).
   */
  getMyOrders(opts?: GetMyOrdersOpts): Observable<MyOrdersListResponse> {
    const view = opts?.view;
    const limit = opts?.limit;
    const offset = opts?.offset;
    const scope = opts?.scope;
    let params = new HttpParams();
    if (view) {
      params = params.set('view', view);
    }
    if (limit != null && Number.isFinite(limit)) {
      params = params.set('limit', String(Math.floor(limit)));
    }
    if (offset != null && Number.isFinite(offset) && offset > 0) {
      params = params.set('offset', String(Math.floor(offset)));
    }
    if (scope) {
      params = params.set('scope', scope);
    }
    const base = opt(opts);
    const extra = params.keys().length ? { params } : {};
    return this.http.get<MyOrdersListResponse>(`${API_URL}/mine`, { ...base, ...extra });
  }

  getOrderSummary(opts?: HttpToastControl): Observable<OrderSummaryCustomer | OrderSummaryDriver> {
    return this.http.get<OrderSummaryCustomer | OrderSummaryDriver>(`${API_URL}/summary`, opt(opts));
  }

  updateOrder(id: string, status: string, opts?: HttpToastControl): Observable<TransportOrder> {
    return this.http.put<TransportOrder>(`${API_URL}/${id}`, { status }, opt(opts));
  }

  /** Driver: PATCH /api/orders/:id/accept (empty body) — same as React driver dashboard. */
  acceptOrder(id: string, opts?: HttpToastControl): Observable<TransportOrder> {
    return this.http.patch<TransportOrder>(`${API_URL}/${id}/accept`, {}, opt(opts));
  }

  /** Driver: PATCH /api/orders/:id/status with body { status: 'in-transit' | 'completed' }. */
  updateOrderStatus(id: string, status: 'in-transit' | 'completed', opts?: HttpToastControl): Observable<TransportOrder> {
    const url = `${API_URL}/${id}/status`;
    return this.http.patch<TransportOrder>(url, { status }, opt(opts));
  }

  completeOrder(id: string, opts?: HttpToastControl): Observable<TransportOrder> {
    return this.http.patch<TransportOrder>(`${API_URL}/${id}/complete`, {}, opt(opts));
  }

  /** Customer: submit rating (1-5) and optional review for a completed order. */
  rateOrder(id: string, rating: number, review?: string, opts?: HttpToastControl): Observable<TransportOrder> {
    return this.http.post<TransportOrder>(`${API_URL}/${id}/rate`, { rating, review: review ?? '' }, opt(opts));
  }
}
