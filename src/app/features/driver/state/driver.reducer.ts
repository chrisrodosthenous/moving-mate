import { createReducer, on } from '@ngrx/store';
import * as DriverActions from './driver.actions';
import type { TransportOrder } from '../../../core/services/orders.service';

export const driverFeatureKey = 'driver';

export interface DriverState {
  availableOrders: TransportOrder[];
  availableTotal: number | null;
  availableLoading: boolean;
  availableLoadingMore: boolean;
  availableSilentRefreshing: boolean;
  availableError: string | null;
  activeTrips: TransportOrder[];
  activeTripsTotal: number | null;
  activeTripsLoading: boolean;
  activeTripsLoadingMore: boolean;
  completedTrips: TransportOrder[];
  completedTripsTotal: number | null;
  completedTripsLoading: boolean;
  completedTripsLoadingMore: boolean;
  myError: string | null;
  highlightedAvailableIds: string[];
  newOrderToast: boolean;
  acceptBusyId: string | null;
  acceptError: string | null;
  tripBusyId: string | null;
  tripStatusError: string | null;
  districtsSaving: boolean;
  districtsError: string | null;
}

export const initialDriverState: DriverState = {
  availableOrders: [],
  availableTotal: null,
  availableLoading: false,
  availableLoadingMore: false,
  availableSilentRefreshing: false,
  availableError: null,
  activeTrips: [],
  activeTripsTotal: null,
  activeTripsLoading: false,
  activeTripsLoadingMore: false,
  completedTrips: [],
  completedTripsTotal: null,
  completedTripsLoading: false,
  completedTripsLoadingMore: false,
  myError: null,
  highlightedAvailableIds: [],
  newOrderToast: false,
  acceptBusyId: null,
  acceptError: null,
  tripBusyId: null,
  tripStatusError: null,
  districtsSaving: false,
  districtsError: null,
};

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

function mergeTrip(list: TransportOrder[], patch: TransportOrder): TransportOrder[] {
  const id = String(patch._id);
  const idx = list.findIndex((o) => String(o._id) === id);
  if (idx === -1) return [patch, ...list];
  const next = [...list];
  next[idx] = { ...next[idx], ...patch };
  return next;
}

const TERMINAL_TRIP_STATUSES = new Set(['delivered', 'completed', 'cancelled', 'canceled']);

function isTerminalTripStatus(status: string | undefined): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return TERMINAL_TRIP_STATUSES.has(s);
}

export const driverReducer = createReducer(
  initialDriverState,
  on(DriverActions.loadDriverAvailable, (state, { silent }) => ({
    ...state,
    availableLoading: silent ? state.availableLoading : true,
    availableError: silent ? state.availableError : null,
    availableSilentRefreshing: silent === true,
  })),
  on(DriverActions.loadDriverAvailableSuccess, (state, { orders, total, silent, newIds }) => ({
    ...state,
    availableOrders: orders.filter((o) => o.status === 'pending'),
    availableTotal: total,
    availableLoading: false,
    availableLoadingMore: false,
    availableSilentRefreshing: false,
    availableError: null,
    highlightedAvailableIds: silent ? newIds : [],
    newOrderToast: Boolean(silent && newIds.length > 0),
  })),
  on(DriverActions.loadDriverAvailableFailure, (state, { error, silent }) => ({
    ...state,
    availableLoading: silent ? state.availableLoading : false,
    availableLoadingMore: false,
    availableSilentRefreshing: false,
    availableError: silent ? state.availableError : error,
  })),
  on(DriverActions.loadDriverAvailableMore, (state) => ({
    ...state,
    availableLoadingMore: true,
  })),
  on(DriverActions.loadDriverAvailableMoreSuccess, (state, { orders: page, total }) => ({
    ...state,
    availableOrders: appendOrdersDeduped(
      state.availableOrders,
      page.filter((o) => o.status === 'pending'),
    ),
    availableTotal: total,
    availableLoadingMore: false,
  })),
  on(DriverActions.loadDriverAvailableMoreFailure, (state) => ({
    ...state,
    availableLoadingMore: false,
  })),
  on(DriverActions.loadDriverActiveTrips, (state, { silent }) => ({
    ...state,
    activeTripsLoading: silent ? state.activeTripsLoading : true,
    myError: silent ? state.myError : null,
  })),
  on(DriverActions.loadDriverActiveTripsSuccess, (state, { orders, total }) => ({
    ...state,
    activeTrips: orders,
    activeTripsTotal: total,
    activeTripsLoading: false,
    activeTripsLoadingMore: false,
    myError: null,
  })),
  on(DriverActions.loadDriverActiveTripsFailure, (state, { error, silent }) => ({
    ...state,
    activeTripsLoading: silent ? state.activeTripsLoading : false,
    myError: silent ? state.myError : error,
  })),
  on(DriverActions.loadDriverActiveTripsMore, (state) => ({
    ...state,
    activeTripsLoadingMore: true,
  })),
  on(DriverActions.loadDriverActiveTripsMoreSuccess, (state, { orders: page, total }) => ({
    ...state,
    activeTrips: appendOrdersDeduped(state.activeTrips, page),
    activeTripsTotal: total,
    activeTripsLoadingMore: false,
  })),
  on(DriverActions.loadDriverActiveTripsMoreFailure, (state) => ({
    ...state,
    activeTripsLoadingMore: false,
  })),
  on(DriverActions.loadDriverCompletedTrips, (state) => ({
    ...state,
    completedTripsLoading: true,
  })),
  on(DriverActions.loadDriverCompletedTripsSuccess, (state, { orders, total }) => ({
    ...state,
    completedTrips: orders,
    completedTripsTotal: total,
    completedTripsLoading: false,
    completedTripsLoadingMore: false,
  })),
  on(DriverActions.loadDriverCompletedTripsFailure, (state) => ({
    ...state,
    completedTripsLoading: false,
  })),
  on(DriverActions.loadDriverCompletedTripsMore, (state) => ({
    ...state,
    completedTripsLoadingMore: true,
  })),
  on(DriverActions.loadDriverCompletedTripsMoreSuccess, (state, { orders: page, total }) => ({
    ...state,
    completedTrips: appendOrdersDeduped(state.completedTrips, page),
    completedTripsTotal: total,
    completedTripsLoadingMore: false,
  })),
  on(DriverActions.loadDriverCompletedTripsMoreFailure, (state) => ({
    ...state,
    completedTripsLoadingMore: false,
  })),
  on(DriverActions.clearDriverAvailableHighlights, (state) => ({
    ...state,
    highlightedAvailableIds: [],
  })),
  on(DriverActions.clearDriverNewOrderToast, (state) => ({
    ...state,
    newOrderToast: false,
  })),
  on(DriverActions.acceptDriverOrder, (state, { id }) => ({
    ...state,
    acceptBusyId: id,
    acceptError: null,
  })),
  on(DriverActions.acceptDriverOrderSuccess, (state) => ({
    ...state,
    acceptBusyId: null,
    acceptError: null,
  })),
  on(DriverActions.acceptDriverOrderFailure, (state, { error }) => ({
    ...state,
    acceptBusyId: null,
    acceptError: error,
  })),
  on(DriverActions.updateDriverTripStatus, (state, { id }) => ({
    ...state,
    tripBusyId: id,
    tripStatusError: null,
  })),
  on(DriverActions.updateDriverTripStatusSuccess, (state, { order }) => {
    const id = String(order._id);
    const terminal = isTerminalTripStatus(order.status);
    const activeTrips = terminal
      ? state.activeTrips.filter((o) => String(o._id) !== id)
      : mergeTrip(state.activeTrips, order);
    const completedTrips =
      state.completedTripsTotal !== null
        ? terminal
          ? mergeTrip(state.completedTrips, order)
          : state.completedTrips.filter((o) => String(o._id) !== id)
        : state.completedTrips;
    return {
      ...state,
      tripBusyId: null,
      tripStatusError: null,
      activeTrips,
      completedTrips,
    };
  }),
  on(DriverActions.updateDriverTripStatusFailure, (state, { error }) => ({
    ...state,
    tripBusyId: null,
    tripStatusError: error,
  })),
  on(DriverActions.updateDriverDistricts, (state) => ({
    ...state,
    districtsSaving: true,
    districtsError: null,
  })),
  on(DriverActions.updateDriverDistrictsSuccess, (state) => ({
    ...state,
    districtsSaving: false,
    districtsError: null,
  })),
  on(DriverActions.updateDriverDistrictsFailure, (state, { error }) => ({
    ...state,
    districtsSaving: false,
    districtsError: error,
  })),
);
