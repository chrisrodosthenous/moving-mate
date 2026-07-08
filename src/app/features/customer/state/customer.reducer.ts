import { createReducer, on } from '@ngrx/store';
import * as CustomerActions from './customer.actions';
import type { TransportOrder } from '../../../core/services/orders.service';

export const customerFeatureKey = 'customer';

export interface CustomerState {
  orders: TransportOrder[];
  /** Total matching `GET /orders/mine` filter; `null` before first fetch completes. */
  ordersTotal: number | null;
  loadingMore: boolean;
  loading: boolean;
  error: string | null;
  /** `GET /orders/mine?scope=completed` — independent of mixed `orders` pagination. */
  completedTabOrders: TransportOrder[];
  completedTabTotal: number | null;
  completedTabLoading: boolean;
  completedTabLoadingMore: boolean;
  createSubmitting: boolean;
  createError: string | null;
  lastCreatedOrder: TransportOrder | null;
  ratingSubmittingOrderId: string | null;
  ratingError: string | null;
}

export const initialCustomerState: CustomerState = {
  orders: [],
  ordersTotal: null,
  loadingMore: false,
  loading: false,
  error: null,
  completedTabOrders: [],
  completedTabTotal: null,
  completedTabLoading: false,
  completedTabLoadingMore: false,
  createSubmitting: false,
  createError: null,
  lastCreatedOrder: null,
  ratingSubmittingOrderId: null,
  ratingError: null,
};

function mergeOrder(list: TransportOrder[], patch: TransportOrder): TransportOrder[] {
  const id = String(patch._id);
  const idx = list.findIndex((o) => String(o._id) === id);
  if (idx === -1) return [patch, ...list];
  const next = [...list];
  next[idx] = { ...next[idx], ...patch };
  return next;
}

function appendOrdersDeduped(existing: TransportOrder[], incoming: TransportOrder[]): TransportOrder[] {
  const seen = new Set(existing.map((o) => String(o._id)));
  const next = [...existing];
  for (const o of incoming) {
    const id = String(o._id);
    if (!seen.has(id)) {
      seen.add(id);
      next.push(o);
    }
  }
  return next;
}

/** Terminal orders for customer “Completed” tab (delivered / cancelled). */
function isCompletedScopeStatus(status: string | undefined): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return ['delivered', 'completed', 'cancelled', 'canceled'].includes(s);
}

export const customerReducer = createReducer(
  initialCustomerState,
  on(CustomerActions.loadCustomerOrders, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(CustomerActions.loadCustomerOrdersSuccess, (state, { orders, total }) => ({
    ...state,
    orders,
    ordersTotal: total,
    loading: false,
    error: null,
    loadingMore: false,
  })),
  on(CustomerActions.loadCustomerOrdersFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(CustomerActions.loadCustomerOrdersSilentSuccess, (state, { orders, total }) => ({
    ...state,
    orders,
    ordersTotal: total,
  })),
  on(CustomerActions.loadCustomerOrdersMore, (state) => ({
    ...state,
    loadingMore: true,
  })),
  on(CustomerActions.loadCustomerOrdersMoreSuccess, (state, { orders: page, total }) => ({
    ...state,
    orders: appendOrdersDeduped(state.orders, page),
    ordersTotal: total,
    loadingMore: false,
  })),
  on(CustomerActions.loadCustomerOrdersMoreFailure, (state) => ({
    ...state,
    loadingMore: false,
  })),
  on(CustomerActions.loadCustomerCompletedOrders, (state) => ({
    ...state,
    completedTabLoading: true,
  })),
  on(CustomerActions.loadCustomerCompletedOrdersSuccess, (state, { orders, total }) => ({
    ...state,
    completedTabOrders: orders,
    completedTabTotal: total,
    completedTabLoading: false,
    completedTabLoadingMore: false,
  })),
  on(CustomerActions.loadCustomerCompletedOrdersFailure, (state) => ({
    ...state,
    completedTabLoading: false,
  })),
  on(CustomerActions.loadCustomerCompletedOrdersMore, (state) => ({
    ...state,
    completedTabLoadingMore: true,
  })),
  on(CustomerActions.loadCustomerCompletedOrdersMoreSuccess, (state, { orders: page, total }) => ({
    ...state,
    completedTabOrders: appendOrdersDeduped(state.completedTabOrders, page),
    completedTabTotal: total,
    completedTabLoadingMore: false,
  })),
  on(CustomerActions.loadCustomerCompletedOrdersMoreFailure, (state) => ({
    ...state,
    completedTabLoadingMore: false,
  })),
  on(CustomerActions.createCustomerOrder, (state) => ({
    ...state,
    createSubmitting: true,
    createError: null,
    lastCreatedOrder: null,
  })),
  on(CustomerActions.createCustomerOrderSuccess, (state, { order }) => ({
    ...state,
    createSubmitting: false,
    createError: null,
    lastCreatedOrder: order,
    orders: mergeOrder(state.orders, order),
  })),
  on(CustomerActions.createCustomerOrderFailure, (state, { error }) => ({
    ...state,
    createSubmitting: false,
    createError: error,
  })),
  on(CustomerActions.clearLastCreatedOrder, (state) => ({
    ...state,
    lastCreatedOrder: null,
  })),
  on(CustomerActions.submitCustomerRating, (state, { orderId }) => ({
    ...state,
    ratingSubmittingOrderId: orderId,
    ratingError: null,
  })),
  on(CustomerActions.submitCustomerRatingSuccess, (state, { orders, total }) => ({
    ...state,
    ratingSubmittingOrderId: null,
    ratingError: null,
    orders,
    ordersTotal: total,
  })),
  on(CustomerActions.submitCustomerRatingFailure, (state, { error }) => ({
    ...state,
    ratingSubmittingOrderId: null,
    ratingError: error,
  })),
  on(CustomerActions.applyCustomerOrderPatch, (state, { order }) => {
    const id = String(order._id);
    const terminal = isCompletedScopeStatus(order.status);

    const nextOrders = terminal
      ? state.orders.filter((o) => String(o._id) !== id)
      : mergeOrder(state.orders, order);

    let nextTab = state.completedTabOrders;
    if (state.completedTabTotal !== null) {
      nextTab = terminal
        ? mergeOrder(state.completedTabOrders, order)
        : state.completedTabOrders.filter((o) => String(o._id) !== id);
    }

    return {
      ...state,
      orders: nextOrders,
      completedTabOrders: nextTab,
    };
  }),
);
