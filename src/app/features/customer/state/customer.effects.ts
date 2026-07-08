import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { catchError, filter, map, switchMap, take, tap, withLatestFrom } from 'rxjs/operators';
import { EMPTY, of } from 'rxjs';
import { OrdersService } from '../../../core/services/orders.service';
import { ReviewsService } from '../../../core/services/reviews.service';
import { ToastService } from '../../../core/services/toast.service';
import * as CustomerActions from './customer.actions';
import { ORDER_LIST_PAGE_SIZE } from '../../../core/constants/list-page-size';
import {
  selectCustomerCompletedTabOrders,
  selectCustomerCompletedTabTotal,
  selectCustomerOrders,
} from './customer.selectors';

const myOrdersListOpts = {
  skipGlobalErrorToast: true as const,
  view: 'summary' as const,
};

@Injectable()
export class CustomerEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly orders = inject(OrdersService);
  private readonly reviews = inject(ReviewsService);
  private readonly toast = inject(ToastService);

  loadMyOrders$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CustomerActions.loadCustomerOrders),
      switchMap(() =>
        this.orders
          .getMyOrders({
            ...myOrdersListOpts,
            limit: ORDER_LIST_PAGE_SIZE,
            offset: 0,
            scope: 'active',
          })
          .pipe(
            map(({ orders, total }) => CustomerActions.loadCustomerOrdersSuccess({ orders, total })),
            catchError((err) =>
              of(
                CustomerActions.loadCustomerOrdersFailure({
                  error: err?.error?.message ?? 'Failed to load orders.',
                }),
              ),
            ),
          ),
      ),
    ),
  );

  loadMyOrdersSilent$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CustomerActions.loadCustomerOrdersSilent),
      withLatestFrom(this.store.select(selectCustomerOrders)),
      switchMap(([_, currentOrders]) => {
        const limit = Math.max(currentOrders.length, ORDER_LIST_PAGE_SIZE);
        return this.orders
          .getMyOrders({ ...myOrdersListOpts, limit, offset: 0, scope: 'active' })
          .pipe(
          map(({ orders, total }) => CustomerActions.loadCustomerOrdersSilentSuccess({ orders, total })),
          catchError(() => EMPTY),
        );
      }),
    ),
  );

  loadMyOrdersMore$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CustomerActions.loadCustomerOrdersMore),
      withLatestFrom(this.store.select(selectCustomerOrders)),
      switchMap(([_, orders]) =>
        this.orders
          .getMyOrders({
            ...myOrdersListOpts,
            limit: ORDER_LIST_PAGE_SIZE,
            offset: orders.length,
            scope: 'active',
          })
          .pipe(
            map(({ orders: page, total }) => CustomerActions.loadCustomerOrdersMoreSuccess({ orders: page, total })),
            catchError((err) =>
              of(
                CustomerActions.loadCustomerOrdersMoreFailure({
                  error: err?.error?.message ?? 'Failed to load more orders.',
                }),
              ),
            ),
          ),
      ),
    ),
  );

  loadCompletedTab$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CustomerActions.loadCustomerCompletedOrders),
      switchMap(() =>
        this.orders
          .getMyOrders({
            ...myOrdersListOpts,
            limit: ORDER_LIST_PAGE_SIZE,
            offset: 0,
            scope: 'completed',
          })
          .pipe(
            map(({ orders, total }) =>
              CustomerActions.loadCustomerCompletedOrdersSuccess({ orders, total }),
            ),
            catchError(() => of(CustomerActions.loadCustomerCompletedOrdersFailure())),
          ),
      ),
    ),
  );

  loadCompletedTabMore$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CustomerActions.loadCustomerCompletedOrdersMore),
      withLatestFrom(this.store.select(selectCustomerCompletedTabOrders)),
      switchMap(([_, tabOrders]) =>
        this.orders
          .getMyOrders({
            ...myOrdersListOpts,
            limit: ORDER_LIST_PAGE_SIZE,
            offset: tabOrders.length,
            scope: 'completed',
          })
          .pipe(
            map(({ orders: page, total }) =>
              CustomerActions.loadCustomerCompletedOrdersMoreSuccess({ orders: page, total }),
            ),
            catchError(() => of(CustomerActions.loadCustomerCompletedOrdersMoreFailure())),
          ),
      ),
    ),
  );

  refreshCompletedTabAfterRating$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CustomerActions.submitCustomerRatingSuccess),
      withLatestFrom(this.store.select(selectCustomerCompletedTabTotal)),
      filter(([_, tabTotal]) => tabTotal !== null),
      switchMap(() =>
        this.store.select(selectCustomerCompletedTabOrders).pipe(
          take(1),
          switchMap((tabOrders) =>
            this.orders
              .getMyOrders({
                ...myOrdersListOpts,
                scope: 'completed',
                limit: Math.max(tabOrders.length, ORDER_LIST_PAGE_SIZE),
                offset: 0,
              })
              .pipe(
                map(({ orders, total }) =>
                  CustomerActions.loadCustomerCompletedOrdersSuccess({ orders, total }),
                ),
                catchError(() => EMPTY),
              ),
          ),
        ),
      ),
    ),
  );

  createOrder$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CustomerActions.createCustomerOrder),
      switchMap(({ payload }) =>
        this.orders.createOrder(payload, { skipGlobalErrorToast: true }).pipe(
          map((order) => CustomerActions.createCustomerOrderSuccess({ order })),
          catchError((err) =>
            of(
              CustomerActions.createCustomerOrderFailure({
                error:
                  err?.error?.message ??
                  err?.error?.error ??
                  'Failed to create order.',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  submitRating$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CustomerActions.submitCustomerRating),
      switchMap(({ orderId, rating, review }) =>
        this.reviews
          .createReview(
            {
              orderId,
              rating,
              comment: review?.trim() ?? '',
            },
            { skipGlobalErrorToast: true },
          )
          .pipe(
            switchMap(() =>
              this.store.select(selectCustomerOrders).pipe(
                take(1),
                switchMap((currentOrders) => {
                  const limit = Math.max(currentOrders.length, ORDER_LIST_PAGE_SIZE);
                  return this.orders
                    .getMyOrders({ ...myOrdersListOpts, limit, offset: 0, scope: 'active' })
                    .pipe(
                    map(({ orders, total }) => CustomerActions.submitCustomerRatingSuccess({ orders, total })),
                  );
                }),
              ),
            ),
            catchError((err) =>
              of(
                CustomerActions.submitCustomerRatingFailure({
                  error: err?.error?.message ?? err?.error?.error ?? 'Failed to submit rating.',
                }),
              ),
            ),
          ),
      ),
    ),
  );

  submitRatingSuccessToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(CustomerActions.submitCustomerRatingSuccess),
        tap(() => this.toast.show('Thank you! Your rating has been submitted.', 'success')),
      ),
    { dispatch: false },
  );
}
