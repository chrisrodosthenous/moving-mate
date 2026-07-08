import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = '/api/payments';

export type OrderPaymentStatus = 'unpaid' | 'authorized' | 'captured' | 'refunded';

export interface CheckoutSessionResponse {
  ok: boolean;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  checkoutSessionId: string;
  redirectPath: string;
  alreadyAuthorized?: boolean;
}

export interface ConfirmPaymentResponse {
  ok: boolean;
  orderId: string;
  paymentStatus: OrderPaymentStatus;
  intentStatus: string;
  amount: number;
  currency: string;
}

export interface PaymentStatusResponse {
  ok: boolean;
  orderId: string;
  orderStatus: string;
  paymentStatus: OrderPaymentStatus;
  intentStatus: string | null;
  amount: number;
  currency: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly http = inject(HttpClient);

  startCheckout(orderId: string): Observable<CheckoutSessionResponse> {
    return this.http.post<CheckoutSessionResponse>(`${API}/checkout/${orderId}`, {});
  }

  confirmMockPayment(orderId: string): Observable<ConfirmPaymentResponse> {
    return this.http.post<ConfirmPaymentResponse>(`${API}/confirm/${orderId}`, {});
  }

  getStatus(orderId: string): Observable<PaymentStatusResponse> {
    return this.http.get<PaymentStatusResponse>(`${API}/status/${orderId}`);
  }
}
