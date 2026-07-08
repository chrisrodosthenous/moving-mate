import { createFeatureSelector, createSelector } from '@ngrx/store';
import { driverFeatureKey, DriverState } from './driver.reducer';

export const selectDriverState = createFeatureSelector<DriverState>(driverFeatureKey);

export const selectDriverAvailableOrders = createSelector(selectDriverState, (s) => s.availableOrders);

export const selectDriverAvailableTotal = createSelector(selectDriverState, (s) => s.availableTotal);

export const selectDriverAvailableLoading = createSelector(selectDriverState, (s) => s.availableLoading);

export const selectDriverAvailableLoadingMore = createSelector(selectDriverState, (s) => s.availableLoadingMore);

export const selectDriverAvailableHasMore = createSelector(selectDriverState, (s) => {
  if (s.availableTotal == null) return false;
  return s.availableOrders.length < s.availableTotal;
});

export const selectDriverAvailableSilentRefreshing = createSelector(
  selectDriverState,
  (s) => s.availableSilentRefreshing,
);

export const selectDriverAvailableError = createSelector(selectDriverState, (s) => s.availableError);

/** Active trips tab (`scope=active`). */
export const selectDriverActiveTrips = createSelector(selectDriverState, (s) => s.activeTrips);

export const selectDriverActiveTripsTotal = createSelector(selectDriverState, (s) => s.activeTripsTotal);

export const selectDriverActiveTripsLoading = createSelector(selectDriverState, (s) => s.activeTripsLoading);

export const selectDriverActiveTripsLoadingMore = createSelector(selectDriverState, (s) => s.activeTripsLoadingMore);

export const selectDriverActiveTripsHasMore = createSelector(selectDriverState, (s) => {
  if (s.activeTripsTotal == null) return false;
  return s.activeTrips.length < s.activeTripsTotal;
});

export const selectDriverCompletedTrips = createSelector(selectDriverState, (s) => s.completedTrips);

export const selectDriverCompletedTripsTotal = createSelector(selectDriverState, (s) => s.completedTripsTotal);

export const selectDriverCompletedTripsLoading = createSelector(selectDriverState, (s) => s.completedTripsLoading);

export const selectDriverCompletedTripsLoadingMore = createSelector(
  selectDriverState,
  (s) => s.completedTripsLoadingMore,
);

export const selectDriverCompletedTripsHasMore = createSelector(selectDriverState, (s) => {
  if (s.completedTripsTotal == null) return false;
  return s.completedTrips.length < s.completedTripsTotal;
});

/** @deprecated Use {@link selectDriverActiveTrips}. */
export const selectDriverMyOrders = selectDriverActiveTrips;

export const selectDriverMyLoading = selectDriverActiveTripsLoading;

export const selectDriverMyError = createSelector(selectDriverState, (s) => s.myError);

export const selectDriverHighlightedAvailableIds = createSelector(
  selectDriverState,
  (s) => s.highlightedAvailableIds,
);

export const selectDriverNewOrderToast = createSelector(selectDriverState, (s) => s.newOrderToast);

export const selectDriverAcceptBusyId = createSelector(selectDriverState, (s) => s.acceptBusyId);

export const selectDriverAcceptError = createSelector(selectDriverState, (s) => s.acceptError);

export const selectDriverTripBusyId = createSelector(selectDriverState, (s) => s.tripBusyId);

export const selectDriverTripStatusError = createSelector(selectDriverState, (s) => s.tripStatusError);

export const selectDriverDistrictsSaving = createSelector(selectDriverState, (s) => s.districtsSaving);

export const selectDriverDistrictsError = createSelector(selectDriverState, (s) => s.districtsError);
