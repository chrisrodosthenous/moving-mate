import { createAction, props } from '@ngrx/store';
import type { CreateOrderPayload, TransportOrder } from '../../../core/services/orders.service';

export const loadCustomerOrders = createAction('[Customer] Load My Orders');

export const loadCustomerOrdersSuccess = createAction(
  '[Customer] Load My Orders Success',
  props<{ orders: TransportOrder[]; total: number }>(),
);

export const loadCustomerOrdersFailure = createAction(
  '[Customer] Load My Orders Failure',
  props<{ error: string }>(),
);

/** Refresh list without toggling `loading` (polling + post-rating, React parity). */
export const loadCustomerOrdersSilent = createAction('[Customer] Load My Orders Silent');

export const loadCustomerOrdersSilentSuccess = createAction(
  '[Customer] Load My Orders Silent Success',
  props<{ orders: TransportOrder[]; total: number }>(),
);

export const loadCustomerOrdersMore = createAction('[Customer] Load My Orders More');

export const loadCustomerOrdersMoreSuccess = createAction(
  '[Customer] Load My Orders More Success',
  props<{ orders: TransportOrder[]; total: number }>(),
);

export const loadCustomerOrdersMoreFailure = createAction(
  '[Customer] Load My Orders More Failure',
  props<{ error: string }>(),
);

/** Completed tab: server `scope=completed` so delivered/cancelled are not buried under newer active rows. */
export const loadCustomerCompletedOrders = createAction('[Customer] Load Completed Tab Orders');

export const loadCustomerCompletedOrdersSuccess = createAction(
  '[Customer] Load Completed Tab Orders Success',
  props<{ orders: TransportOrder[]; total: number }>(),
);

export const loadCustomerCompletedOrdersFailure = createAction('[Customer] Load Completed Tab Orders Failure');

export const loadCustomerCompletedOrdersMore = createAction('[Customer] Load Completed Tab Orders More');

export const loadCustomerCompletedOrdersMoreSuccess = createAction(
  '[Customer] Load Completed Tab Orders More Success',
  props<{ orders: TransportOrder[]; total: number }>(),
);

export const loadCustomerCompletedOrdersMoreFailure = createAction('[Customer] Load Completed Tab Orders More Failure');

export const createCustomerOrder = createAction(
  '[Customer] Create Order',
  props<{ payload: CreateOrderPayload }>(),
);

export const createCustomerOrderSuccess = createAction(
  '[Customer] Create Order Success',
  props<{ order: TransportOrder }>(),
);

export const createCustomerOrderFailure = createAction(
  '[Customer] Create Order Failure',
  props<{ error: string }>(),
);

export const clearLastCreatedOrder = createAction('[Customer] Clear Last Created Order');

export const submitCustomerRating = createAction(
  '[Customer] Submit Rating',
  props<{ orderId: string; rating: number; review?: string }>(),
);

export const submitCustomerRatingSuccess = createAction(
  '[Customer] Submit Rating Success',
  props<{ orders: TransportOrder[]; total: number }>(),
);

export const submitCustomerRatingFailure = createAction(
  '[Customer] Submit Rating Failure',
  props<{ error: string }>(),
);

/** Merge or append order from socket.io `order_updated` / similar. */
export const applyCustomerOrderPatch = createAction(
  '[Customer] Apply Order Patch',
  props<{ order: TransportOrder }>(),
);
