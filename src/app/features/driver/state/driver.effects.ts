import { Injectable, inject, effect } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { catchError, map, mergeMap, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { of } from 'rxjs';
import type { TransportOrder, AvailableOrdersListResponse } from '../../../core/services/orders.service';
import { OrdersService } from '../../../core/services/orders.service';
import { ORDER_LIST_PAGE_SIZE } from '../../../core/constants/list-page-size';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoggerService } from '../../../core/services/logger.service';
import { SocketService } from '../../../core/services/socket.service';
import { AuthStore } from '../../../store/auth.store';
import * as DriverActions from './driver.actions';
import {
  selectDriverActiveTrips,
  selectDriverAvailableOrders,
  selectDriverCompletedTrips,
} from './driver.selectors';

function parseAvailableList(
  res: TransportOrder[] | AvailableOrdersListResponse,
): { orders: TransportOrder[]; total: number } {
  if (Array.isArray(res)) {
    const orders = res.filter((o) => o.status === 'pending');
    return { orders, total: orders.length };
  }
  const orders = (res.orders ?? []).filter((o) => o.status === 'pending');
  return { orders, total: res.total ?? orders.length };
}

const myTripsListOpts = {
  skipGlobalErrorToast: true as const,
  view: 'summary' as const,
};

@Injectable()
export class DriverEffects {
  private readonly actions$ = inject(Actions);
  private readonly orders = inject(OrdersService);
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);
  private readonly authService = inject(AuthService);
  private readonly authStore = inject(AuthStore);
  private readonly socket = inject(SocketService);
  private readonly logger = inject(LoggerService);

  /** Refresh available jobs when the server emits `new_order_available`. */
  private readonly newOrderSocketRefresh = effect(() => {
    const tick = this.socket.onNewOrderAvailableTick();
    if (tick === 0) return;
    this.store.dispatch(DriverActions.loadDriverAvailable({ silent: true }));
  });

  loadAvailable$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.loadDriverAvailable),
      withLatestFrom(this.store.select(selectDriverAvailableOrders)),
      switchMap(([{ silent }, previous]) => {
        const limit = silent
          ? Math.max(previous.length, ORDER_LIST_PAGE_SIZE)
          : ORDER_LIST_PAGE_SIZE;
        return this.orders.getOrders({ skipGlobalErrorToast: true, limit, offset: 0 }).pipe(
          map((res) => {
            const { orders, total } = parseAvailableList(res);
            const prevIds = new Set(previous.map((o) => o._id));
            const newIds = silent ? orders.filter((o) => !prevIds.has(o._id)).map((o) => o._id) : [];
            return DriverActions.loadDriverAvailableSuccess({ orders, total, silent, newIds });
          }),
          catchError((err) => {
            if (silent) {
              this.logger.warn('[driver] Silent available-jobs refresh failed:', err?.error?.message ?? err);
            }
            return of(
              DriverActions.loadDriverAvailableFailure({
                error: err?.error?.message ?? 'Could not load available orders',
                silent,
              }),
            );
          }),
        );
      }),
    ),
  );

  loadAvailableMore$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.loadDriverAvailableMore),
      withLatestFrom(this.store.select(selectDriverAvailableOrders)),
      switchMap(([_, current]) =>
        this.orders
          .getOrders({
            skipGlobalErrorToast: true,
            limit: ORDER_LIST_PAGE_SIZE,
            offset: current.length,
          })
          .pipe(
            map((res) => {
              const { orders, total } = parseAvailableList(res);
              return DriverActions.loadDriverAvailableMoreSuccess({ orders, total });
            }),
            catchError(() => of(DriverActions.loadDriverAvailableMoreFailure())),
          ),
      ),
    ),
  );

  loadActiveTrips$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.loadDriverActiveTrips),
      withLatestFrom(this.store.select(selectDriverActiveTrips)),
      switchMap(([{ silent }, current]) => {
        const limit = silent ? Math.max(current.length, ORDER_LIST_PAGE_SIZE) : ORDER_LIST_PAGE_SIZE;
        return this.orders.getMyOrders({ ...myTripsListOpts, limit, offset: 0, scope: 'active' }).pipe(
          map(({ orders, total }) =>
            DriverActions.loadDriverActiveTripsSuccess({ orders, total, silent }),
          ),
          catchError((err) => {
            if (silent) return of();
            return of(
              DriverActions.loadDriverActiveTripsFailure({
                error: err?.error?.message ?? 'Could not load your tasks',
                silent,
              }),
            );
          }),
        );
      }),
    ),
  );

  loadActiveTripsMore$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.loadDriverActiveTripsMore),
      withLatestFrom(this.store.select(selectDriverActiveTrips)),
      switchMap(([_, trips]) =>
        this.orders
          .getMyOrders({
            ...myTripsListOpts,
            limit: ORDER_LIST_PAGE_SIZE,
            offset: trips.length,
            scope: 'active',
          })
          .pipe(
            map(({ orders: page, total }) =>
              DriverActions.loadDriverActiveTripsMoreSuccess({ orders: page, total }),
            ),
            catchError(() => of(DriverActions.loadDriverActiveTripsMoreFailure())),
          ),
      ),
    ),
  );

  loadCompletedTrips$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.loadDriverCompletedTrips),
      switchMap(() =>
        this.orders
          .getMyOrders({
            ...myTripsListOpts,
            limit: ORDER_LIST_PAGE_SIZE,
            offset: 0,
            scope: 'completed',
          })
          .pipe(
            map(({ orders, total }) => DriverActions.loadDriverCompletedTripsSuccess({ orders, total })),
            catchError(() => of(DriverActions.loadDriverCompletedTripsFailure())),
          ),
      ),
    ),
  );

  loadCompletedTripsMore$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.loadDriverCompletedTripsMore),
      withLatestFrom(this.store.select(selectDriverCompletedTrips)),
      switchMap(([_, trips]) =>
        this.orders
          .getMyOrders({
            ...myTripsListOpts,
            limit: ORDER_LIST_PAGE_SIZE,
            offset: trips.length,
            scope: 'completed',
          })
          .pipe(
            map(({ orders: page, total }) =>
              DriverActions.loadDriverCompletedTripsMoreSuccess({ orders: page, total }),
            ),
            catchError(() => of(DriverActions.loadDriverCompletedTripsMoreFailure())),
          ),
      ),
    ),
  );

  acceptOrder$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.acceptDriverOrder),
      switchMap(({ id }) =>
        this.orders.acceptOrder(id, { skipGlobalErrorToast: true }).pipe(
          map(() => DriverActions.acceptDriverOrderSuccess({ id })),
          catchError((err) =>
            of(
              DriverActions.acceptDriverOrderFailure({
                error: err?.error?.message ?? 'Could not accept order',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  acceptOrderSuccessRefresh$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.acceptDriverOrderSuccess),
      mergeMap(() => [
        DriverActions.loadDriverAvailable({ silent: true }),
        DriverActions.loadDriverActiveTrips({ silent: true }),
      ]),
    ),
  );

  acceptOrderSuccessToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DriverActions.acceptDriverOrderSuccess),
        tap(() => this.toast.show('Order accepted successfully!', 'success')),
      ),
    { dispatch: false },
  );

  updateTripStatus$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.updateDriverTripStatus),
      switchMap(({ id, status }) =>
        this.orders.updateOrderStatus(id, status, { skipGlobalErrorToast: true }).pipe(
          map((order) => DriverActions.updateDriverTripStatusSuccess({ order })),
          catchError((err) =>
            of(
              DriverActions.updateDriverTripStatusFailure({
                error: err?.error?.message ?? 'Could not update status',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  tripStatusSuccessRefresh$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.updateDriverTripStatusSuccess),
      mergeMap(() => [DriverActions.loadDriverActiveTrips({ silent: true })]),
    ),
  );

  updateDriverDistricts$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.updateDriverDistricts),
      switchMap(({ districts }) =>
        this.authService.updateDriverDistricts(districts, { skipGlobalErrorToast: true }).pipe(
          map((res) => DriverActions.updateDriverDistrictsSuccess({ user: res.user })),
          catchError((err) =>
            of(
              DriverActions.updateDriverDistrictsFailure({
                error: err?.error?.message ?? 'Could not update working districts',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  updateDriverDistrictsSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(DriverActions.updateDriverDistrictsSuccess),
      tap(({ user }) => {
        this.authStore.updateUser(user);
        this.socket.refreshConnection();
        this.toast.show('Working districts updated!', 'success');
      }),
      mergeMap(() => [DriverActions.loadDriverAvailable({ silent: false })]),
    ),
  );
}
