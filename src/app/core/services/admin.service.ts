import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import type { HttpToastControl } from '../http/http-error-context';
import { httpOptionsSkipGlobalErrorToast } from '../http/http-error-context';
import type { OrderLaborRequired, OrderVehicleType, StoredOrderVehicleType } from '../models/order.model';
import type { DriverVehicleType } from '../models/driver.model';

export type { OrderLaborRequired, OrderLogistics, OrderLogisticsPartial, OrderVehicleType } from '../models/order.model';

const API_URL = '/api/admin';
/** Same-origin base for `/uploads/...` license URLs; proxy in dev. */
export const ADMIN_API_BASE = '';

export interface PendingVerificationUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  licenseUrl: string;
  vehicleType?: DriverVehicleType | string;
  vehiclePhotoUrl?: string;
  dateOfBirth?: string;
  createdAt?: string;
}

export interface AdminUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: string;
  district?: string | null;
  districts?: string[];
  isVerified?: boolean;
  verificationStatus?: 'pending' | 'approved' | 'rejected' | string;
  licenseUrl?: string;
  vehicleType?: DriverVehicleType | string;
  vehiclePhotoUrl?: string;
  dateOfBirth?: string;
  carModel?: string;
  plateNumber?: string;
  averageRating?: number | null;
  reviewCount?: number;
  createdAt?: string;
}

export interface VerifyDriverResponse {
  success: boolean;
  message: string;
  user?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    isVerified?: boolean;
    verificationStatus?: string;
    rejectionReason?: string;
    vehicleType?: string;
    vehiclePhotoUrl?: string;
  };
}

export interface AdminOrderPerson {
  _id?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  carModel?: string;
  plateNumber?: string;
}

export interface AdminOrder {
  _id: string;
  customerId: { _id: string; firstName?: string; lastName?: string; email?: string; phoneNumber?: string } | string;
  driverId?: { _id: string; firstName?: string; lastName?: string; email?: string; phoneNumber?: string } | string | null;
  customer?: AdminOrderPerson | null;
  driver?: AdminOrderPerson | null;
  pickupDistrict?: string;
  pickupLocation: { address: string; lat: number; lng: number };
  dropoffLocation: { address: string; lat: number; lng: number };
  status: string;
  price: number;
  driverEarnings?: number;
  platformCommission?: number;
  commissionRate?: number;
  scheduledAt?: string;
  smallBoxes?: number;
  mediumBoxes?: number;
  largeBoxes?: number;
  cargoImageUrl?: string;
  /** ISO submission time (aligned with TransportOrder.submittedAt / createdAt). */
  submittedAt?: string;
  createdAt: string;
  distanceKm?: number;
  insuranceStatus?: boolean;
  /** Last persisted driver GPS (when available). */
  driverLocation?: { lat: number; lng: number; heading?: number } | null;
  /** Logistics (optional on legacy orders). */
  vehicleType?: StoredOrderVehicleType;
  pickupFloor?: string;
  destinationFloor?: string;
  hasElevator?: boolean;
  laborRequired?: OrderLaborRequired;
}

/** GET /api/admin/orders/:id */
export interface AdminOrderDetailResponse {
  success?: boolean;
  messageCount?: number;
  order: AdminOrder;
}

export interface AdminOverview {
  users: AdminUser[];
  orders: AdminOrder[];
}

export interface AdminAnalyticsPayload {
  trend: { labels: string[]; orders: number[]; revenue: number[] };
  districts: { labels: string[]; counts: number[] };
  topDrivers: { labels: string[]; trips: number[] };
}

export interface PendingVerificationsResponse {
  users: PendingVerificationUser[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) {}

  getOverview(opts?: HttpToastControl): Observable<AdminOverview> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http.get<AdminOverview>(`${API_URL}/overview`, h);
  }

  getAnalytics(opts?: HttpToastControl): Observable<AdminAnalyticsPayload> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http.get<AdminAnalyticsPayload>(`${API_URL}/analytics`, h);
  }

  getPendingVerifications(): Observable<PendingVerificationsResponse> {
    return this.http.get<PendingVerificationsResponse>(`${API_URL}/pending-verifications?t=${new Date().getTime()}`);
  }

  getAdminOrderDetail(id: string): Observable<AdminOrderDetailResponse> {
    const idParam = encodeURIComponent(String(id).trim());
    return this.http.get<AdminOrderDetailResponse>(`${API_URL}/orders/${idParam}`);
  }

  getDriverLicenseBlob(userId: string): Observable<Blob> {
    return this.http.get(`${API_URL}/driver-documents/${encodeURIComponent(userId)}/license`, {
      responseType: 'blob',
    });
  }

  /** PUT /api/admin/drivers/:id/verify — approve or reject driver verification. */
  verifyDriver(
    driverId: string,
    status: 'approved' | 'rejected',
    reason?: string,
  ): Observable<VerifyDriverResponse> {
    if (status === 'rejected') {
      const r = (reason ?? '').trim();
      if (!r) {
        return throwError(() => new Error('Rejection reason is required'));
      }
      return this.http.put<VerifyDriverResponse>(
        `${API_URL}/drivers/${encodeURIComponent(driverId)}/verify`,
        { status, reason: r },
      );
    }
    return this.http.put<VerifyDriverResponse>(
      `${API_URL}/drivers/${encodeURIComponent(driverId)}/verify`,
      { status },
    );
  }

  /** PATCH /api/admin/verify-user/:id — rejection requires non-empty `reason` (server validates). */
  verifyUser(
    id: string,
    status: 'approved' | 'rejected',
    reason?: string,
  ): Observable<{ success: boolean; message: string; user?: unknown }> {
    if (status === 'rejected') {
      const r = (reason ?? '').trim();
      if (!r) {
        return throwError(
          () => new Error('Rejection reason is required'),
        );
      }
      return this.http.patch<{ success: boolean; message: string; user?: unknown }>(
        `${API_URL}/verify-user/${encodeURIComponent(id)}`,
        { status, reason: r },
      );
    }
    return this.http.patch<{ success: boolean; message: string; user?: unknown }>(
      `${API_URL}/verify-user/${encodeURIComponent(id)}`,
      { status },
    );
  }
}
