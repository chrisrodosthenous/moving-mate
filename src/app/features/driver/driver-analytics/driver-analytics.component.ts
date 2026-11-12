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
