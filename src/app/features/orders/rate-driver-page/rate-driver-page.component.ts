import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { take } from 'rxjs/operators';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { AuthService } from '../../../core/services/auth.service';
import { TransportOrder } from '../../../core/services/orders.service';
import * as CustomerActions from '../../customer/state/customer.actions';
import {
  selectCustomerOrders,
  selectCustomerOrdersLoading,
  selectCustomerRatingSubmittingOrderId,
} from '../../customer/state/customer.selectors';

@Component({
  selector: 'app-rate-driver-page',
  standalone: true,
  imports: [RouterLink, FormsModule, SidebarComponent, EmptyStateComponent],
  templateUrl: './rate-driver-page.component.html',
  styleUrl: './rate-driver-page.component.css',
})
export class RateDriverPageComponent {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly actions$ = inject(Actions);
  readonly auth = inject(AuthService);

  readonly orderId = this.route.snapshot.paramMap.get('orderId') ?? '';

  readonly orders = toSignal(this.store.select(selectCustomerOrders), { initialValue: [] });
  readonly loading = toSignal(this.store.select(selectCustomerOrdersLoading), { initialValue: true });
  readonly ratingSubmittingOrderId = toSignal(
    this.store.select(selectCustomerRatingSubmittingOrderId),
    { initialValue: null },
  );

  order = signal<TransportOrder | null>(null);
  notFound = signal(false);
  ratingStars = signal(0);
  reviewText = signal('');
  ratingSuccess = signal(false);

  constructor() {
    this.store.dispatch(CustomerActions.loadCustomerOrders());

    effect(() => {
      const list = this.orders();
      if (this.loading()) return;

      const id = this.orderId;
      if (!id) {
        this.notFound.set(true);
        this.order.set(null);
        return;
      }

      const o = list.find((x) => String(x._id) === id);
      if (!o) {
        this.notFound.set(true);
        this.order.set(null);
        return;
      }

      const custId =
        o.customerId && typeof o.customerId === 'object'
          ? String(o.customerId._id ?? '')
          : String(o.customerId ?? '');
      if (custId !== this.auth.user()?.id) {
        this.notFound.set(true);
        this.order.set(null);
        return;
      }

      this.notFound.set(false);
      this.order.set(o);
    });
  }

  setStar(value: number): void {
    this.ratingStars.set(value);
  }

  submitRating(): void {
    const o = this.order();
    const stars = this.ratingStars();
    if (!o || stars < 1 || stars > 5) return;

    this.actions$
      .pipe(
        ofType(
          CustomerActions.submitCustomerRatingSuccess,
          CustomerActions.submitCustomerRatingFailure,
        ),
        take(1),
      )
      .subscribe((action) => {
        const a = action as
          | ReturnType<typeof CustomerActions.submitCustomerRatingSuccess>
          | ReturnType<typeof CustomerActions.submitCustomerRatingFailure>;
        if (a.type === CustomerActions.submitCustomerRatingSuccess.type) {
          this.ratingSuccess.set(true);
          const o = this.order();
          const id = o ? String(o._id) : this.orderId;
          const updated = a.orders.find((x) => String(x._id) === id);
          if (updated) this.order.set(updated);
          setTimeout(() => void this.router.navigateByUrl('/customer/orders'), 1200);
        }
      });

    this.store.dispatch(
      CustomerActions.submitCustomerRating({
        orderId: String(o._id),
        rating: stars,
        review: this.reviewText().trim() || undefined,
      }),
    );
  }

  goOrders(): void {
    void this.router.navigateByUrl('/customer/orders');
  }
}
