import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type { AdminOrder, AdminUser } from '../../../core/services/admin.service';
import { UiButtonComponent } from '@/components/ui/button';
import { ADMIN_TABLE_PAGE_SIZE, nextAdminTableVisibleCount } from '../shared/admin-table-pagination';
import { ADMIN_TABLE, adminTableBadgeClass } from '../shared/admin-table-theme';
import {
  countDriverCompletedTrips,
  driverAvailability,
  driverDistrictLabel,
  fullName,
  matchesSearch,
  vehicleLabel,
} from '../shared/admin-management.utils';

const PRIORITY_RATING = 4.5;

export interface AdminDriverRow {
  user: AdminUser;
  fullName: string;
  district: string;
  rating: number | null;
  priority: boolean;
  vehicle: string;
  completedTrips: number;
  availability: ReturnType<typeof driverAvailability>;
}

@Component({
  selector: 'app-admin-drivers',
  standalone: true,
  imports: [UiButtonComponent, LucideAngularModule],
  templateUrl: './admin-drivers.component.html',
})
export class AdminDriversComponent {
  readonly users = input<AdminUser[]>([]);
  readonly orders = input<AdminOrder[]>([]);
  readonly loading = input(false);

  readonly viewDriver = output<AdminUser>();

  readonly search = signal('');
  readonly visibleCount = signal(ADMIN_TABLE_PAGE_SIZE);
  readonly table = ADMIN_TABLE;
  readonly priorityThreshold = PRIORITY_RATING;

  constructor() {
    effect(() => {
      this.search();
      untracked(() => this.visibleCount.set(ADMIN_TABLE_PAGE_SIZE));
    });
  }

  readonly rows = computed((): AdminDriverRow[] => {
    const orders = this.orders();
    return this.users()
      .filter((u) => u.role === 'driver')
      .map((user) => {
        const rating = user.averageRating ?? null;
        return {
          user,
          fullName: fullName(user),
          district: driverDistrictLabel(user),
          rating,
          priority: rating != null && rating >= PRIORITY_RATING,
          vehicle: vehicleLabel(user),
          completedTrips: countDriverCompletedTrips(user._id, orders),
          availability: driverAvailability(user, orders),
        };
      });
  });

  readonly filteredRows = computed(() => {
    const q = this.search();
    return this.rows().filter((r) => {
      const blob = [
        r.fullName,
        r.district,
        r.vehicle,
        r.availability.label,
        r.rating != null ? String(r.rating) : '',
      ].join(' ');
      return matchesSearch(blob, q);
    });
  });

  readonly displayedRows = computed(() => this.filteredRows().slice(0, this.visibleCount()));

  readonly hasMore = computed(() => this.visibleCount() < this.filteredRows().length);

  readonly showingLabel = computed(() => {
    const total = this.filteredRows().length;
    const shown = this.displayedRows().length;
    if (total === 0) return '0 drivers';
    if (shown >= total) return `${total} driver${total === 1 ? '' : 's'}`;
    return `Showing ${shown} of ${total} drivers`;
  });

  loadMore(): void {
    this.visibleCount.set(nextAdminTableVisibleCount(this.visibleCount(), this.filteredRows().length));
  }

  badgeClass = adminTableBadgeClass;

  ratingDisplay(rating: number | null): string {
    return rating != null && Number.isFinite(rating) ? rating.toFixed(1) : '—';
  }
}
