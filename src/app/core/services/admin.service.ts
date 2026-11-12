import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import type { HttpToastControl } from '../http/http-error-context';
import { httpOptionsSkipGlobalErrorToast } from '../http/http-error-context';
import type { OrderLaborRequired, OrderVehicleType, StoredOrderVehicleType } from '../models/order.model';
import type { DriverVehicleType } from '../models/driver.model';
import type { AuthUser } from '../../store/auth.store';

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
  isSuspended?: boolean;
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
  paymentStatus?: string;
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
  pickupHasElevator?: boolean;
  dropoffHasElevator?: boolean;
  laborRequired?: OrderLaborRequired;
}

/** GET /api/admin/orders/:id */
export interface AdminOrderDetailResponse {
  success?: boolean;
  order: AdminOrder;
}

export interface AdminOverview {
  users: AdminUser[];
  orders: AdminOrder[];
}

export interface AdminDirectoryQuery {
  offset?: number;
  limit?: number;
  search?: string;
  name?: string;
  contact?: string;
  district?: string;
  orders?: string;
  status?: string;
  rating?: string;
  vehicle?: string;
  trips?: string;
  availability?: string;
  id?: string;
  customer?: string;
  driver?: string;
  place?: string;
  logistics?: string;
  price?: string;
  created?: string;
}

export interface AdminDirectoryPage<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  districts?: string[];
  vehicles?: string[];
}

export type AdminCustomerListItem = AdminUser & {
  totalOrders?: number;
  districtLabel?: string;
  fullName?: string;
  statusLabel?: string;
};

export type AdminDriverListItem = AdminUser & {
  fullName?: string;
  districtLabel?: string;
  vehicleLabel?: string;
  completedTrips?: number;
  availabilityLabel?: string;
  ratingText?: string;
};

export type AdminCustomerDirectoryPage = AdminDirectoryPage<AdminCustomerListItem>;
export type AdminDriverDirectoryPage = AdminDirectoryPage<AdminDriverListItem>;
export type AdminOrderDirectoryPage = AdminDirectoryPage<AdminOrder>;

function directoryParams(query: AdminDirectoryQuery): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    params[key] = String(value);
  }
  return params;
}

export interface AdminAnalyticsSummary {
  clients: number;
  drivers: { all: number; verified: number; not_verified: number; pending: number };
  orders: {
    all: number;
    pending_payment: number;
    pending_driver: number;
    accepted: number;
    on_the_way: number;
    picked_up: number;
    delivered: number;
    cancelled: number;
  };
  ledger: {
    grossTurnover: number;
    platformRevenue: number;
    driverEarnings: number;
    completedCount: number;
  };
}

export interface AdminAnalyticsPayload {
  trend: { labels: string[]; orders: number[]; revenue: number[] };
  districts: { labels: string[]; counts: number[] };
  topDrivers: { labels: string[]; trips: number[] };
  summary?: AdminAnalyticsSummary;
}

export interface PendingVerificationsResponse {
  users: PendingVerificationUser[];
}

export interface AdminPricingPreview {
  label: string;
  vehicleType: string;
  distanceKm: number;
  total: number;
  pricingBasis: string;
  driverEarnings: number;
  platformCommission: number;
  commissionRate: number;
}

export interface AdminPricingVehicleRates {
  baseFee: number;
  rateNear: number;
  rateFar: number;
  minFare: number;
  consumptionLPer100Km: number;
  wearPerKm: number;
}

export interface AdminPricingConfig {
  dieselPricePerLitreEur: number;
  driverHourlyTargetEur: number;
  helperHourlyRateEur: number;
  handlingRatePerMinuteEur: number;
  stairsSurchargePerFloor: number;
  distanceTaperThresholdKm: number;
  averageSpeedKmh: number;
  deadheadKm: number;
  setupHours: number;
  handlingMinutesPerItem: {
    boxes: number;
    mediumItems: number;
    largeFurniture: number;
    heavyAppliances: number;
  };
  crewMultiplier: {
    none: number;
    driver: number;
    driver_plus_helper: number;
  };
  vehicles: {
    pickup: AdminPricingVehicleRates;
    minivan: AdminPricingVehicleRates;
    van: AdminPricingVehicleRates;
    truck: AdminPricingVehicleRates;
  };
  commissionTiers: Array<{ upToEur: number | null; ratePercent: number }>;
}

export interface AdminPricingConfigResponse {
  config: AdminPricingConfig;
  version: number;
  preview: AdminPricingPreview[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) {}

  getOverview(opts?: HttpToastControl): Observable<AdminOverview> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http.get<AdminOverview>(`${API_URL}/overview`, h);
  }

  getAnalytics(opts?: HttpToastControl & { range?: string }): Observable<AdminAnalyticsPayload> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    const range = opts?.range ? `?range=${encodeURIComponent(opts.range)}` : '';
    return this.http.get<AdminAnalyticsPayload>(`${API_URL}/analytics${range}`, h);
  }

  getPendingVerifications(): Observable<PendingVerificationsResponse> {
    return this.http.get<PendingVerificationsResponse>(`${API_URL}/pending-verifications?t=${new Date().getTime()}`);
  }

  getAdminOrderDetail(id: string): Observable<AdminOrderDetailResponse> {
    const idParam = encodeURIComponent(String(id).trim());
    return this.http.get<AdminOrderDetailResponse>(`${API_URL}/orders/${idParam}`);
  }

  setCustomerSuspension(customerId: string, suspended: boolean): Observable<{ success: boolean; user: AdminUser }> {
    return this.setAccountSuspension('customers', customerId, suspended);
  }

  setDriverSuspension(driverId: string, suspended: boolean): Observable<{ success: boolean; user: AdminUser }> {
    return this.setAccountSuspension('drivers', driverId, suspended);
  }

  impersonate(userId: string): Observable<{ code: string; role: string }> {
    const idParam = encodeURIComponent(String(userId).trim());
    return this.http.post<{ code: string; role: string }>(
      `${API_URL}/impersonate/${idParam}`,
      {},
      httpOptionsSkipGlobalErrorToast(),
    );
  }

  redeemImpersonation(code: string): Observable<{ message: string; token: string; user: AuthUser }> {
    return this.http.post<{ message: string; token: string; user: AuthUser }>(
      `${API_URL}/impersonate/redeem`,
      { code },
      httpOptionsSkipGlobalErrorToast(),
    );
  }

  listCustomers(query: AdminDirectoryQuery): Observable<AdminCustomerDirectoryPage> {
    return this.http.get<AdminCustomerDirectoryPage>(`${API_URL}/customers`, { params: directoryParams(query) });
  }

  listDrivers(query: AdminDirectoryQuery): Observable<AdminDriverDirectoryPage> {
    return this.http.get<AdminDriverDirectoryPage>(`${API_URL}/drivers`, { params: directoryParams(query) });
  }

  listOrders(query: AdminDirectoryQuery): Observable<AdminOrderDirectoryPage> {
    return this.http.get<AdminOrderDirectoryPage>(`${API_URL}/orders`, { params: directoryParams(query) });
  }

  private setAccountSuspension(
    kind: 'customers' | 'drivers',
    userId: string,
    suspended: boolean,
  ): Observable<{ success: boolean; user: AdminUser }> {
    const idParam = encodeURIComponent(String(userId).trim());
    return this.http.patch<{ success: boolean; user: AdminUser }>(
      `${API_URL}/${kind}/${idParam}/suspension`,
      { suspended },
    );
  }

  getDriverLicenseBlob(userId: string): Observable<Blob> {
    return this.http.get(`${API_URL}/driver-documents/${encodeURIComponent(userId)}/license`, {
      responseType: 'blob',
    });
  }

  getPrivateDocument(userId: string, docType: 'license' | 'vehicle-photo' | 'id-card'): Observable<Blob> {
    return this.http.get(
      `/api/users/documents/${encodeURIComponent(userId)}/${docType}`,
      { responseType: 'blob' },
    );
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

  getPricingConfig(): Observable<AdminPricingConfigResponse> {
    return this.http.get<AdminPricingConfigResponse>(`${API_URL}/pricing-config`);
  }

  updatePricingConfig(body: { config: Partial<AdminPricingConfig> }): Observable<AdminPricingConfigResponse> {
    return this.http.put<AdminPricingConfigResponse>(`${API_URL}/pricing-config`, body);
  }

  previewPricingConfig(body: { config: Partial<AdminPricingConfig> }): Observable<AdminPricingConfigResponse> {
    return this.http.post<AdminPricingConfigResponse>(`${API_URL}/pricing-config/preview`, body);
  }
}
