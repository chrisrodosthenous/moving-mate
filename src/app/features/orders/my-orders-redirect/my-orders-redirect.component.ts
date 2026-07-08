import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../../store/auth.store';

/**
 * Push notifications use `/my-orders`. Customers go to the customer hub; drivers go to My trips.
 */
@Component({
  selector: 'app-my-orders-redirect',
  standalone: true,
  template: '',
})
export class MyOrdersRedirectComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);

  ngOnInit(): void {
    const role = this.auth.user()?.role;
    if (role === 'customer' || role === 'admin') {
      void this.router.navigateByUrl('/customer/orders', { replaceUrl: true });
    } else if (role === 'driver') {
      void this.router.navigateByUrl('/driver/tasks', { replaceUrl: true });
    } else {
      void this.router.navigateByUrl('/orders/my-orders', { replaceUrl: true });
    }
  }
}
