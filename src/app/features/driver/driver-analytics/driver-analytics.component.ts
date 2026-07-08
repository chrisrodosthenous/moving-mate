import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { catchError, EMPTY } from 'rxjs';
import { CHART_THEME } from '../../../core/constants/admin-chart-theme';
import type { DriverAnalyticsPayload } from '../../../core/services/users.service';
import { UsersService } from '../../../core/services/users.service';
import { buildDriverAnalyticsFromOrders, emptyDriverAnalytics } from './driver-analytics.utils';
import type { TransportOrder } from '../../../core/services/orders.service';

@Component({
  selector: 'app-driver-analytics',
  standalone: true,
  imports: [BaseChartDirective],
  templateUrl: './driver-analytics.component.html',
})
export class DriverAnalyticsComponent {
  private readonly usersService = inject(UsersService);
  private readonly auth = inject(AuthService);

  readonly loading = input(false);
  readonly fallbackOrders = input<TransportOrder[]>([]);
  readonly fallbackRating = input<number | null>(null);

  private readonly payload = signal<DriverAnalyticsPayload>(emptyDriverAnalytics());

  readonly barChartType = 'bar' as const;
  readonly doughnutChartType = 'doughnut' as const;

  readonly earningsChartData = computed((): ChartData<'bar'> => {
    const w = this.payload().weeklyEarnings;
    return {
      labels: w.labels,
      datasets: [
        {
          label: 'Earnings',
          data: w.euros,
          backgroundColor: CHART_THEME.primary,
          hoverBackgroundColor: CHART_THEME.hover,
          borderRadius: 8,
          maxBarThickness: 40,
        },
      ],
    };
  });

  readonly tripStatsChartData = computed((): ChartData<'doughnut'> => {
    const t = this.payload().tripStats;
    const hasData = t.completed + t.cancelled + t.declined > 0;
    return {
      labels: ['Completed', 'Cancelled', 'Declined'],
      datasets: [
        {
          data: hasData ? [t.completed, t.cancelled, t.declined] : [1, 0, 0],
          backgroundColor: hasData
            ? [CHART_THEME.primary, CHART_THEME.error, CHART_THEME.accent]
            : [CHART_THEME.track, CHART_THEME.track, CHART_THEME.track],
          borderColor: CHART_THEME.grid,
          borderWidth: 2,
          hoverOffset: 10,
        },
      ],
    };
  });

  readonly ratingGaugeData = computed((): ChartData<'doughnut'> => {
    const avg = this.payload().rating.average;
    const max = this.payload().rating.max;
    const score = avg != null && Number.isFinite(avg) ? Math.min(max, Math.max(0, avg)) : 0;
    const remainder = Math.max(0, max - score);
    return {
      labels: ['Rating', 'Remaining'],
      datasets: [
        {
          data: [score, remainder],
          backgroundColor: [CHART_THEME.primary, CHART_THEME.track],
          borderWidth: 0,
          hoverOffset: 0,
        },
      ],
    };
  });

  readonly earningsChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      ...driverChartPlugins(),
      tooltip: {
        ...driverChartPlugins().tooltip,
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const v = ctx.parsed.y ?? 0;
            return `${ctx.dataset.label ?? 'Earnings'}: ${Number(v).toFixed(2)} €`;
          },
        },
      },
    },
    scales: {
      x: driverAxisStyle(),
      y: {
        ...driverAxisStyle(),
        beginAtZero: true,
        ticks: {
          ...driverAxisStyle().ticks,
          callback: (value) => `€${value}`,
        },
      },
    },
  };

  readonly tripStatsChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '58%',
    plugins: {
      ...driverChartPlugins(),
      legend: {
        position: 'bottom',
        labels: {
          color: CHART_THEME.labelMuted,
          padding: 12,
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
    },
  };

  readonly ratingGaugeOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '78%',
    rotation: -90,
    circumference: 180,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
  };

  readonly ratingDisplay = computed(() => {
    const avg = this.payload().rating.average;
    return avg != null && Number.isFinite(avg) ? avg.toFixed(1) : '—';
  });

  readonly ratingCaption = computed(() => {
    const r = this.payload().rating;
    const avg = r.average;
    if (avg == null || !Number.isFinite(avg)) {
      return 'Current Rating: —/5.0. Complete trips to earn your first reviews!';
    }
    const line = `Current Rating: ${avg.toFixed(1)}/${r.max.toFixed(1)}.`;
    const tip =
      avg >= r.priorityThreshold
        ? ' Priority access unlocked — keep it up!'
        : ' Keep it above 4.5 for Priority Access!';
    return line + tip;
  });

  readonly weekEarningsTotal = computed(() =>
    this.payload()
      .weeklyEarnings.euros.reduce((a, b) => a + b, 0)
      .toFixed(2),
  );

  constructor() {
    effect(() => {
      const orders = this.fallbackOrders();
      const uid = this.auth.user()?.id ?? '';
      if (!uid || orders.length === 0) return;
      untracked(() =>
        this.payload.set(buildDriverAnalyticsFromOrders(orders, uid, this.fallbackRating())),
      );
    });
    this.applyFromOrdersOrApi();
  }

  reload(): void {
    this.applyFromOrdersOrApi();
  }

  private applyFromOrdersOrApi(): void {
    const orders = this.fallbackOrders();
    const uid = this.auth.user()?.id ?? '';
    const rating = this.fallbackRating();
    if (uid && orders.length > 0) {
      this.payload.set(buildDriverAnalyticsFromOrders(orders, uid, rating));
      return;
    }
    this.usersService
      .getDriverAnalytics()
      .pipe(catchError(() => EMPTY))
      .subscribe((data) => this.payload.set(data));
  }
}

function driverChartPlugins(): NonNullable<ChartOptions['plugins']> {
  return {
    legend: {
      labels: {
        color: CHART_THEME.label,
        font: { size: 11 },
        boxWidth: 10,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(9, 9, 9, 0.96)',
      titleColor: CHART_THEME.label,
      bodyColor: CHART_THEME.labelMuted,
      borderColor: CHART_THEME.gridDriver,
      borderWidth: 1,
      padding: 10,
    },
  };
}

function driverAxisStyle(): {
  grid: { color: string };
  ticks: { color: string; font: { size: number } };
  border: { color: string };
} {
  return {
    grid: { color: CHART_THEME.gridDriver },
    ticks: { color: CHART_THEME.labelMuted, font: { size: 11 } },
    border: { color: CHART_THEME.gridDriver },
  };
}
