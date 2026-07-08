import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  computed,
  input,
  output,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import type { TransportOrder } from '../../../../core/services/orders.service';
import type { BadgeVariant } from '@/components/ui/badge';
import { UiBadgeComponent } from '@/components/ui/badge';
import {
  driverFloorLabel,
  driverHasLaborHelp,
  driverLaborHelpLabel,
  driverShowElevatorAvailable,
  driverShowNoElevatorWarning,
  driverVehicleTypeIcon,
  driverVehicleTypeLabel,
} from '../../../utils/driver-job-logistics.utils';
import {
  DRIVER_JOB_BODY_TEXT,
  DRIVER_JOB_CARD_BASE,
  DRIVER_JOB_CARD_HIGHLIGHT,
  DRIVER_JOB_CARD_SELECTED,
  DRIVER_JOB_MUTED_TEXT,
} from './driver-job-card.theme';
import {
  driverNetEarningsForOrder,
  isCompletedOrderStatus,
} from '../../../utils/order-commission.util';

@Component({
  selector: 'app-driver-job-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, LucideAngularModule, UiBadgeComponent],
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
    const parts = [DRIVER_JOB_CARD_BASE];
    if (this.selected()) parts.push(DRIVER_JOB_CARD_SELECTED);
    if (this.highlighted()) parts.push(DRIVER_JOB_CARD_HIGHLIGHT);
    if (this.completedMuted()) parts.push('opacity-90');
    return parts.join(' ');
  });

  readonly vehicleLabel = computed(() => driverVehicleTypeLabel(this.order().vehicleType));
  readonly vehicleIcon = computed(() => driverVehicleTypeIcon(this.order().vehicleType));
  readonly pickupFloorText = computed(() => driverFloorLabel(this.order().pickupFloor));
  readonly destinationFloorText = computed(() => driverFloorLabel(this.order().destinationFloor));
  readonly laborLabel = computed(() => driverLaborHelpLabel(this.order().laborRequired));
  readonly showLaborBadge = computed(() => driverHasLaborHelp(this.order().laborRequired));
  readonly laborIconName = computed(() =>
    this.order().laborRequired === 'driver_plus_helper' ? 'users' : 'user',
  );
  readonly showNoElevator = computed(() => driverShowNoElevatorWarning(this.order().hasElevator));
  readonly showElevatorOk = computed(() => driverShowElevatorAvailable(this.order().hasElevator));

  readonly showNetEarnings = computed(
    () => this.completedMuted() && isCompletedOrderStatus(this.order().status),
  );
  readonly netEarningsAmount = computed(() => driverNetEarningsForOrder(this.order()));

  readonly bodyText = DRIVER_JOB_BODY_TEXT;
  readonly mutedText = DRIVER_JOB_MUTED_TEXT;

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
