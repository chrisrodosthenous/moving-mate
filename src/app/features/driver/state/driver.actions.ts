import { createAction, props } from '@ngrx/store';
import type { AuthUser } from '../../../store/auth.store';
import type { TransportOrder } from '../../../core/services/orders.service';

export const loadDriverAvailable = createAction(
  '[Driver] Load Available Orders',
  props<{ silent?: boolean }>(),
);

export const loadDriverAvailableSuccess = createAction(
  '[Driver] Load Available Orders Success',
  props<{ orders: TransportOrder[]; total: number; silent?: boolean; newIds: string[] }>(),
);

export const loadDriverAvailableFailure = createAction(
  '[Driver] Load Available Orders Failure',
  props<{ error: string; silent?: boolean }>(),
);

export const loadDriverAvailableMore = createAction('[Driver] Load Available Orders More');

export const loadDriverAvailableMoreSuccess = createAction(
  '[Driver] Load Available Orders More Success',
  props<{ orders: TransportOrder[]; total: number }>(),
);

export const loadDriverAvailableMoreFailure = createAction('[Driver] Load Available Orders More Failure');

export const loadDriverActiveTrips = createAction(
  '[Driver] Load Active Trips',
  props<{ silent?: boolean }>(),
);

export const loadDriverActiveTripsSuccess = createAction(
  '[Driver] Load Active Trips Success',
  props<{ orders: TransportOrder[]; total: number; silent?: boolean }>(),
);

export const loadDriverActiveTripsFailure = createAction(
  '[Driver] Load Active Trips Failure',
  props<{ error: string; silent?: boolean }>(),
);

export const loadDriverActiveTripsMore = createAction('[Driver] Load Active Trips More');

export const loadDriverActiveTripsMoreSuccess = createAction(
  '[Driver] Load Active Trips More Success',
  props<{ orders: TransportOrder[]; total: number }>(),
);

export const loadDriverActiveTripsMoreFailure = createAction('[Driver] Load Active Trips More Failure');

export const loadDriverCompletedTrips = createAction('[Driver] Load Completed Trips');

export const loadDriverCompletedTripsSuccess = createAction(
  '[Driver] Load Completed Trips Success',
  props<{ orders: TransportOrder[]; total: number }>(),
);

export const loadDriverCompletedTripsFailure = createAction('[Driver] Load Completed Trips Failure');

export const loadDriverCompletedTripsMore = createAction('[Driver] Load Completed Trips More');

export const loadDriverCompletedTripsMoreSuccess = createAction(
  '[Driver] Load Completed Trips More Success',
  props<{ orders: TransportOrder[]; total: number }>(),
);

export const loadDriverCompletedTripsMoreFailure = createAction('[Driver] Load Completed Trips More Failure');

/** @deprecated Use {@link loadDriverActiveTrips} — kept for gradual migration. */
export const loadDriverMyOrders = loadDriverActiveTrips;

/** @deprecated Use {@link loadDriverActiveTripsSuccess}. */
export const loadDriverMyOrdersSuccess = loadDriverActiveTripsSuccess;

/** @deprecated Use {@link loadDriverActiveTripsFailure}. */
export const loadDriverMyOrdersFailure = loadDriverActiveTripsFailure;

export const clearDriverAvailableHighlights = createAction('[Driver] Clear Available Highlights');

export const clearDriverNewOrderToast = createAction('[Driver] Clear New Order Toast');

export const acceptDriverOrder = createAction('[Driver] Accept Order', props<{ id: string }>());

export const acceptDriverOrderSuccess = createAction(
  '[Driver] Accept Order Success',
  props<{ id: string }>(),
);

export const acceptDriverOrderFailure = createAction(
  '[Driver] Accept Order Failure',
  props<{ error: string }>(),
);

export const updateDriverTripStatus = createAction(
  '[Driver] Update Trip Status',
  props<{ id: string; status: 'in-transit' | 'completed' }>(),
);

export const updateDriverTripStatusSuccess = createAction(
  '[Driver] Update Trip Status Success',
  props<{ order: TransportOrder }>(),
);

export const updateDriverTripStatusFailure = createAction(
  '[Driver] Update Trip Status Failure',
  props<{ error: string }>(),
);

export const updateDriverDistricts = createAction(
  '[Driver] Update Districts',
  props<{ districts: string[] }>(),
);

export const updateDriverDistrictsSuccess = createAction(
  '[Driver] Update Districts Success',
  props<{ user: AuthUser }>(),
);

export const updateDriverDistrictsFailure = createAction(
  '[Driver] Update Districts Failure',
  props<{ error: string }>(),
);
