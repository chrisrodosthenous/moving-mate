import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaymentsService } from '../../../core/services/payments.service';
import { AuthService } from '../../../core/services/auth.service';
import { UiButtonComponent } from '@/components/ui/button';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-order-checkout',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink, UiButtonComponent],
  templateUrl: './order-checkout.component.html',
  styleUrl: './order-checkout.component.css',
})
export class OrderCheckoutComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly payments = inject(PaymentsService);
  private readonly auth = inject(AuthService);

  readonly mockPayments = environment.mockPayments;

  readonly orderId = signal('');
  readonly amount = signal(0);
  readonly currency = signal('EUR');
  readonly loading = signal(true);
  readonly paying = signal(false);
  readonly error = signal<string | null>(null);
  readonly authorized = signal(false);

  readonly checkoutEmail = computed(() => this.auth.user()?.email ?? 'customer@movingmate.test');
  readonly cardNumber = signal('4242 4242 4242 4242');
  readonly cardExpiry = signal('12 / 34');
  readonly cardCvc = signal('123');
  readonly cardName = computed(() => {
    const u = this.auth.user();
    const name = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
    return name || 'Test Customer';
  });

  readonly orderShortId = computed(() => {
    const id = this.orderId();
    return id.length > 8 ? id.slice(-8).toUpperCase() : id.toUpperCase();
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('orderId') ?? '';
    this.orderId.set(id);
    if (!id) {
      this.error.set('Missing order id');
      this.loading.set(false);
      return;
    }

    this.payments.startCheckout(id).subscribe({
      next: (session) => {
        this.amount.set(session.amount);
        this.currency.set(session.currency);
        if (session.alreadyAuthorized || session.status === 'authorized') {
          this.authorized.set(true);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Could not start checkout');
        this.loading.set(false);
      },
    });
  }

  confirmPayment(): void {
    const id = this.orderId();
    if (!id || this.paying() || this.authorized()) return;
    this.paying.set(true);
    this.error.set(null);

    this.payments.confirmMockPayment(id).subscribe({
      next: () => {
        this.authorized.set(true);
        this.paying.set(false);
        window.setTimeout(() => {
          void this.router.navigate(['/customer/orders'], {
            queryParams: { paid: id },
          });
        }, 900);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Payment failed');
        this.paying.set(false);
      },
    });
  }
}
