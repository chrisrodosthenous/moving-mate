import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AdminUser, PendingVerificationUser } from '../../core/services/admin.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { formatOrderDateForDisplay } from '../../shared/utils/order-utils';
import { UiButtonComponent } from '@/components/ui/button';
import { ADMIN_FLEET_TAB, type AdminFleetTabId } from '../../core/constants/statuses';
import {
  driverVehicleTypeLabel,
} from '../../core/models/driver.model';

const DRIVER_VERIFY_BTN =
  'min-h-11 shrink-0 rounded-lg px-4 text-sm font-bold bg-[#7BBDE8] text-[#001D39] hover:bg-[#6EA2B3] disabled:pointer-events-none disabled:opacity-60';

const DRIVER_VEHICLE_BADGE =
  'inline-flex items-center rounded-md border border-[#7BBDE8]/55 bg-[#0A4174] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7BBDE8] shadow-[0_0_10px_rgba(123,189,232,0.15)]';

@Component({
  selector: 'app-admin-fleet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyStateComponent, UiButtonComponent],
  templateUrl: './admin-fleet.component.html',
  styleUrl: './admin-panels.css',
})
export class AdminFleetComponent {
  protected readonly fleetTabEnum = ADMIN_FLEET_TAB;
  protected readonly driverVerifyBtnClass = DRIVER_VERIFY_BTN;
  protected readonly driverVehicleBadgeClass = DRIVER_VEHICLE_BADGE;

  readonly totalDriversCount = input.required<number>();
  readonly driverTab = input.required<AdminFleetTabId>();
  readonly notVerifiedDrivers = input<AdminUser[] | PendingVerificationUser[]>([]);
  readonly pendingDrivers = input<AdminUser[] | PendingVerificationUser[]>([]);
  readonly verifiedDrivers = input<AdminUser[] | PendingVerificationUser[]>([]);
  readonly selectedDriver = input<AdminUser | PendingVerificationUser | null>(null);
  readonly licenseBaseUrl = input.required<string>();
  readonly verifyingId = input<string | null>(null);

  readonly driverTabChange = output<AdminFleetTabId>();
  readonly selectDriver = output<AdminUser | PendingVerificationUser>();
  readonly openLicensePreview = output<string>();
  readonly openVehiclePhotoPreview = output<string>();
  readonly approveDriver = output<string>();
  readonly rejectDriver = output<AdminUser | PendingVerificationUser>();

  readonly formatDateLabel = formatOrderDateForDisplay;
  readonly vehicleTypeLabel = driverVehicleTypeLabel;

  vehicleTypeBadge(type: string | undefined | null): string {
    return driverVehicleTypeLabel(type);
  }

  canReviewDriver(driver: AdminUser | PendingVerificationUser): boolean {
    return !!(driver.licenseUrl || driver.vehiclePhotoUrl);
  }

  vehiclePhotoSrc(driver: AdminUser | PendingVerificationUser): string | null {
    const url = driver.vehiclePhotoUrl?.trim();
    if (!url) return null;
    return this.licenseBaseUrl() + url;
  }

  onVehiclePhotoClick(event: Event, url: string | undefined | null): void {
    event.stopPropagation();
    const trimmed = url?.trim();
    if (!trimmed) return;
    this.openVehiclePhotoPreview.emit(trimmed);
  }
}
