import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { LucideAngularModule } from 'lucide-angular';
import type { AdminDriverListItem, AdminOrder, AdminUser } from '../../../core/services/admin.service';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { UiButtonComponent } from '@/components/ui/button';
import { ADMIN_TABLE_PAGE_SIZE } from '../shared/admin-table-pagination';
import { ADMIN_TABLE, adminTableBadgeClass, type AdminTableBadgeTone } from '../shared/admin-table-theme';
import { orderStatusAdminLabel, orderStatusBadgeClass } from '../shared/admin-management.utils';
import { orderShortId } from '../../../shared/utils/order-utils';

const PRIORITY_RATING = 4.5;

export interface AdminDriverRow {
  user: AdminUser;
  fullName: string;
  district: string;
  rating: number | null;
  priority: boolean;
  vehicle: string;
  completedTrips: number;
  availability: { label: 'Online' | 'Offline' | 'Busy' | 'Suspended'; tone: AdminTableBadgeTone };
}

@Component({
  selector: 'app-admin-drivers',
  standalone: true,
  imports: [DatePipe, DecimalPipe, UiButtonComponent, LucideAngularModule],
  templateUrl: './admin-drivers.component.html',
})
export class AdminDriversComponent {
  readonly orders = input<AdminOrder[]>([]);
  readonly loading = input(false);

  readonly suspensionChanged = output<AdminUser>();

  readonly search = signal('');
  readonly nameFilter = signal('');
  readonly districtFilter = signal('all');
  readonly ratingFilter = signal('');
  readonly vehicleFilter = signal('');
  readonly tripsFilter = signal('');
  readonly availabilityFilter = signal<'all' | 'Online' | 'Offline' | 'Busy' | 'Suspended'>('all');
  readonly selected = signal<AdminDriverRow | null>(null);
  readonly suspensionBusy = signal(false);
  readonly impersonating = signal(false);
  readonly impersonateError = signal('');
  readonly loadedRows = signal<AdminDriverRow[]>([]);
  readonly resultTotal = signal(0);
  readonly districtOptions = signal<string[]>([]);
  readonly listLoading = signal(false);
  readonly table = ADMIN_TABLE;
  readonly priorityThreshold = PRIORITY_RATING;
  readonly orderStatusLabel = orderStatusAdminLabel;
  readonly orderStatusClass = orderStatusBadgeClass;
  readonly shortId = orderShortId;
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private requestSeq = 0;

  constructor() {
    effect(() => {
      this.search();
      this.nameFilter();
      this.districtFilter();
      this.ratingFilter();
      this.vehicleFilter();
      this.tripsFilter();
      this.availabilityFilter();
      untracked(() => this.fetchPage(0, false));
    });
  }

  readonly displayedRows = computed(() => this.loadedRows());
  readonly hasMore = computed(() => this.loadedRows().length < this.resultTotal());

  readonly filtersActive = computed(
    () =>
      this.nameFilter().trim() !== '' ||
      this.districtFilter() !== 'all' ||
      this.ratingFilter().trim() !== '' ||
      this.vehicleFilter().trim() !== '' ||
      this.tripsFilter().trim() !== '' ||
      this.availabilityFilter() !== 'all',
  );

  readonly selectedTrips = computed(() => {
    const driver = this.selected();
    if (!driver) return [];
    const id = String(driver.user._id);
    return this.orders().filter((order) => {
      const driverId =
        order.driverId && typeof order.driverId === 'object'
          ? String(order.driverId._id ?? '')
          : String(order.driverId ?? '');
      return driverId === id;
    });
  });

  readonly showingLabel = computed(() => {
    const total = this.resultTotal();
    const shown = this.displayedRows().length;
    if (total === 0) return '0 drivers';
    if (shown >= total) return `${total} driver${total === 1 ? '' : 's'}`;
    return `Showing ${shown} of ${total} drivers`;
  });

  loadMore(): void {
    this.fetchPage(this.loadedRows().length, true);
  }

  private fetchPage(offset: number, append: boolean): void {
    const seq = ++this.requestSeq;
    this.listLoading.set(true);
    this.admin
      .listDrivers({
        offset,
        limit: ADMIN_TABLE_PAGE_SIZE,
        search: this.search(),
        name: this.nameFilter(),
        district: this.districtFilter(),
        rating: this.ratingFilter(),
        vehicle: this.vehicleFilter(),
        trips: this.tripsFilter(),
        availability: this.availabilityFilter(),
      })
      .subscribe({
        next: (res) => {
          if (seq !== this.requestSeq) return;
          const mapped = res.items.map((item) => this.toRow(item));
          this.loadedRows.set(append ? [...this.loadedRows(), ...mapped] : mapped);
          this.resultTotal.set(res.total);
          this.districtOptions.set(res.districts ?? []);
          this.listLoading.set(false);
        },
        error: () => {
          if (seq !== this.requestSeq) return;
          this.listLoading.set(false);
        },
      });
  }

  private toRow(item: AdminDriverListItem): AdminDriverRow {
    const rating = item.averageRating ?? null;
    const label = (item.availabilityLabel ?? 'Offline') as AdminDriverRow['availability']['label'];
    return {
      user: item,
      fullName: item.fullName || '—',
      district: item.districtLabel || 'All districts',
      rating,
      priority: rating != null && rating >= PRIORITY_RATING,
      vehicle: item.vehicleLabel || '—',
      completedTrips: item.completedTrips ?? 0,
      availability: { label, tone: availabilityTone(label) },
    };
  }

  openDriver(row: AdminDriverRow): void {
    this.impersonateError.set('');
    this.selected.set(row);
  }

  closeDriver(): void {
    this.selected.set(null);
  }

  toggleSuspension(row: AdminDriverRow): void {
    if (this.suspensionBusy()) return;
    const suspended = !row.user.isSuspended;
    this.suspensionBusy.set(true);
    this.admin.setDriverSuspension(row.user._id, suspended).subscribe({
      next: (res) => {
        const user = { ...row.user, ...res.user, isSuspended: suspended };
        this.suspensionChanged.emit(user);
        this.suspensionBusy.set(false);
        this.fetchPage(0, false);
      },
      error: () => this.suspensionBusy.set(false),
    });
  }

  impersonate(row: AdminDriverRow): void {
    if (this.impersonating()) return;
    const preview = window.open('', '_blank');
    if (!preview) {
      this.impersonateError.set('Allow pop-ups to open this account in a new tab.');
      return;
    }
    this.impersonateError.set('');
    this.impersonating.set(true);
    this.writeSigningIn(preview);
    this.admin.impersonate(row.user._id).subscribe({
      next: (res) => {
        this.auth.openImpersonatedTab(res.code, preview);
        this.impersonating.set(false);
      },
      error: (err: HttpErrorResponse) => {
        preview.close();
        const message = err.error?.message;
        this.impersonateError.set(typeof message === 'string' ? message : 'Could not sign in as this driver.');
        this.impersonating.set(false);
      },
    });
  }

  private writeSigningIn(preview: Window): void {
    try {
      preview.document.title = 'Moving Mate';
      preview.document.body.textContent = 'Signing you in…';
    } catch {
      /* The blank tab can still navigate once the account is ready. */
    }
  }

  badgeClass = adminTableBadgeClass;

  ratingDisplay(rating: number | null): string {
    return rating != null && Number.isFinite(rating) ? rating.toFixed(1) : '—';
  }
}

function availabilityTone(label: string): AdminTableBadgeTone {
  if (label === 'Online') return 'active';
  if (label === 'Busy') return 'pending';
  if (label === 'Suspended') return 'cancelled';
  return 'muted';
}
