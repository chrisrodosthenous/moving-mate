import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  computed,
  input,
  output,
} from '@angular/core';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import type { TransportOrder } from '../../../../core/services/orders.service';

function sideHasElevator(order: TransportOrder, side: 'pickup' | 'dropoff'): boolean {
  const specific = side === 'pickup' ? order.pickupHasElevator : order.dropoffHasElevator;
  const other = side === 'pickup' ? order.dropoffHasElevator : order.pickupHasElevator;
  if (specific === true || other === true) return specific === true;
  return order.hasElevator === true;
}
import type { BadgeVariant } from '@/components/ui/badge';
import { UiBadgeComponent } from '@/components/ui/badge';
import {
  driverFloorLabel,
  driverVehicleTypeIcon,
  driverVehicleTypeLabel,
} from '../../../utils/driver-job-logistics.utils';
import {
  driverNetEarningsForOrder,
  isCompletedOrderStatus,
} from '../../../utils/order-commission.util';

@Component({
  selector: 'app-driver-job-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, NgTemplateOutlet, LucideAngularModule, UiBadgeComponent],
  templateUrl: './driver-job-card.component.html',
  host: {
    tabindex: '0',
    role: 'article',
    '(click)': 'onHostClick($event)',
    '(keydown.enter)': 'onHostKeydown($event)',
    '(keydown.space)': 'onHostKeydown($event)',
  },
})
export class DriverJobCardComponent {
  readonly order = input.required<TransportOrder>();
  readonly selected = input(false);
  readonly highlighted = input(false);
  readonly showActiveBadge = input(false);
  /** Trip list: show order id + status badge above the pay/vehicle row. */
  readonly variant = input<'available' | 'trip'>('available');
  readonly orderShortId = input<string | null>(null);
  readonly statusLabel = input<string | null>(null);
  readonly statusBadgeVariant = input<BadgeVariant>('orderPending');
  readonly cargoImageUrl = input<string | null>(null);
  readonly completedMuted = input(false);
  /** Optional `data-testid` on the card host (E2E). */
  readonly hostTestId = input<string | null>(null);
  /** Optional `data-testid` on the status badge (E2E). */
  readonly statusTestId = input<string | null>(null);
  /** Driver lists show payout. Customer orders show the trip price only. */
  readonly showEarnings = input(true);

  readonly cardActivate = output<Event>();

  @HostBinding('attr.data-testid')
  get hostTestIdAttr(): string | null {
    return this.hostTestId();
  }
  readonly cargoPhotoClick = output<Event>();

  @HostBinding('class')
  get hostClass(): string {
    return this.shellClass();
  }

  readonly shellClass = computed(() => {
    const base =
      'driver-job-card relative block w-full cursor-pointer rounded-xl border border-border/30 border-l-4 bg-secondary/45 p-4 shadow-surface outline-none backdrop-blur-sm transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';
    const state = this.selected()
      ? 'border-l-primary bg-primary/15'
      : 'border-l-transparent hover:border-border/50 hover:bg-secondary/90';
    const highlight = this.highlighted()
      ? 'ring-2 ring-primary/40 ring-offset-1 ring-offset-background'
      : '';
    const muted = this.completedMuted() ? 'opacity-90' : '';
    return [base, state, highlight, muted].filter(Boolean).join(' ');
  });

  readonly vehicleLabel = computed(() => driverVehicleTypeLabel(this.order().vehicleType));
  /** Customer cards show the assigned driver's plates next to the vehicle. */
  readonly vehiclePlates = computed(() => {
    if (this.showEarnings()) return '';
    const driver = this.order().driverId;
    if (!driver || typeof driver !== 'object') return '';
    return (driver.plateNumber ?? '').trim();
  });
  readonly vehicleIcon = computed(() => driverVehicleTypeIcon(this.order().vehicleType));
  readonly pickupFloorText = computed(() => driverFloorLabel(this.order().pickupFloor));
  readonly destinationFloorText = computed(() => driverFloorLabel(this.order().destinationFloor));
  readonly pickupElevator = computed(() => sideHasElevator(this.order(), 'pickup'));
  readonly dropoffElevator = computed(() => sideHasElevator(this.order(), 'dropoff'));

  readonly showNetEarnings = computed(
    () => this.completedMuted() && isCompletedOrderStatus(this.order().status),
  );
  readonly netEarningsAmount = computed(() => driverNetEarningsForOrder(this.order()));

  /** Both driver lists use the customer My orders card colors. */
  tone(_available: string, shared: string): string {
    return shared;
  }

  bodyClass(): string {
    return 'text-card-title';
  }

  mutedClass(): string {
    return 'text-muted';
  }

  onHostClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a[href], input, textarea, select, [data-no-card-activate]')) {
      return;
    }
    this.cardActivate.emit(event);
  }

  onHostKeydown(event: Event): void {
    if (event instanceof KeyboardEvent && event.key === ' ') {
      event.preventDefault();
    }
    this.cardActivate.emit(event);
  }

  onCargoClick(event: Event): void {
    event.stopPropagation();
    this.cargoPhotoClick.emit(event);
  }
}
