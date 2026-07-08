import { createFeatureSelector, createSelector } from '@ngrx/store';
import { customerFeatureKey, CustomerState } from './customer.reducer';

export const selectCustomerState = createFeatureSelector<CustomerState>(customerFeatureKey);

export const selectCustomerOrders = createSelector(selectCustomerState, (s) => s.orders);

export const selectCustomerOrdersTotal = createSelector(selectCustomerState, (s) => s.ordersTotal);

export const selectCustomerOrdersLoadingMore = createSelector(selectCustomerState, (s) => s.loadingMore);

/** True when server reports more rows than we have loaded (initial `total` from `GET /orders/mine`). */
export const selectCustomerOrdersHasMore = createSelector(selectCustomerState, (s) => {
  if (s.ordersTotal == null) return false;
  return s.orders.length < s.ordersTotal;
});

export const selectCustomerOrdersLoading = createSelector(selectCustomerState, (s) => s.loading);

export const selectCustomerOrdersError = createSelector(selectCustomerState, (s) => s.error);

export const selectCustomerCompletedTabOrders = createSelector(selectCustomerState, (s) => s.completedTabOrders);

export const selectCustomerCompletedTabTotal = createSelector(selectCustomerState, (s) => s.completedTabTotal);

export const selectCustomerCompletedTabLoading = createSelector(selectCustomerState, (s) => s.completedTabLoading);

export const selectCustomerCompletedTabLoadingMore = createSelector(selectCustomerState, (s) => s.completedTabLoadingMore);

/** Completed tab pagination (scope=completed). */
export const selectCustomerCompletedTabHasMore = createSelector(selectCustomerState, (s) => {
  if (s.completedTabTotal == null) return false;
  return s.completedTabOrders.length < s.completedTabTotal;
});

export const selectCustomerCreateSubmitting = createSelector(selectCustomerState, (s) => s.createSubmitting);

export const selectCustomerCreateError = createSelector(selectCustomerState, (s) => s.createError);

export const selectCustomerLastCreatedOrder = createSelector(
  selectCustomerState,
  (s) => s.lastCreatedOrder,
);

export const selectCustomerRatingSubmittingOrderId = createSelector(
  selectCustomerState,
  (s) => s.ratingSubmittingOrderId,
);

export const selectCustomerRatingError = createSelector(selectCustomerState, (s) => s.ratingError);
