import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { UiButtonComponent } from '@/components/ui/button';
import type { OrderPriceBreakdown } from '../../shared/utils/order-pricing.util';

@Component({
  selector: 'app-order-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, UiButtonComponent],
  templateUrl: './order-summary.component.html',
})
export class OrderSummaryComponent {
  readonly loading = input(false);
  readonly distanceKm = input<number | null>(null);
  readonly durationText = input('');
  readonly pricingBreakdown = input<OrderPriceBreakdown | null>(null);
  readonly createSubmitting = input(false);
  readonly canConfirm = input(false);

  /** Explicit path to parent `create-order` (avoids relying on native form / `type="submit"` inside `ui-button`). */
  readonly submitOrder = output<void>();

  onConfirmClick(): void {
    this.submitOrder.emit();
  }
}
