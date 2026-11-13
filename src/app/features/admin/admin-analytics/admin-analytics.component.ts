import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import type { AdminAnalyticsPayload, AdminAnalyticsSummary, AdminOrder, AdminUser } from '../../../core/services/admin.service';
import { AdminService } from '../../../core/services/admin.service';
import { WalletService } from '../../../core/services/wallet.service';
import { ADMIN_CHART } from '../../../core/constants/admin-chart-theme';
import { emptyAnalyticsPayload } from './admin-analytics.utils';
import {
  driverNetEarningsForOrder,
  isCompletedOrderStatus,
  platformCommissionForOrder,
} from '../../../shared/utils/order-commission.util';
import { isOrderPaymentReadyForAccept } from '../../../shared/utils/order-payment.util';
import { roundMoney } from '../../../shared/utils/order-pricing.util';
import type { AnalyticsTrendRange } from '../../../shared/utils/chart-date-buckets';
import {
  driverMatchesFleetNotVerifiedTab,
  driverMatchesFleetPendingTab,
  driverMatchesFleetVerifiedTab,
} from '../../../core/constants/statuses';

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [BaseChartDirective, DecimalPipe, FormsModule],
  templateUrl: './admin-analytics.component.html',
})
export class AdminAnalyticsComponent {
  private readonly adminService = inject(AdminService);
  private readonly walletService = inject(WalletService);

  readonly orders = input<AdminOrder[]>([]);
  readonly users = input<AdminUser[]>([]);
  readonly loading = input(false);

  readonly trendRange = signal<AnalyticsTrendRange>('month');
  readonly driverStatus = signal<'all' | 'verified' | 'not_verified' | 'pending'>('all');
  readonly orderStatus = signal<AdminOrderStat>('all');

  readonly platformWalletAvailable = signal(0);
  readonly platformWalletLoading = signal(false);
  readonly platformWalletError = signal('');

  private readonly payload = signal<AdminAnalyticsPayload>(emptyAnalyticsPayload());
  private readonly summary = signal<AdminAnalyticsSummary | null>(null);

  readonly lineChartType = 'line' as const;
  readonly doughnutChartType = 'doughnut' as const;
  readonly barChartType = 'bar' as const;

  readonly lineChartData = computed((): ChartData<'line'> => {
    const p = this.payload();
    return {
      labels: p.trend.labels,
      datasets: [
        {
          label: 'Orders',
          data: p.trend.orders,
          borderColor: ADMIN_CHART.primary,
          backgroundColor: (ctx) => {
            const { ctx: canvasCtx, chartArea } = ctx.chart;
            return this.lineFillGradient(canvasCtx, chartArea);
          },
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: ADMIN_CHART.primary,
          pointBorderColor: ADMIN_CHART.label,
          pointBorderWidth: 2,
          yAxisID: 'y',
        },
        {
          label: 'Revenue (€)',
          data: p.trend.revenue,
          borderColor: ADMIN_CHART.secondary,
          backgroundColor: 'transparent',
          borderDash: [6, 4],
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: ADMIN_CHART.secondary,
          yAxisID: 'y1',
        },
      ],
    };
  });

  readonly doughnutChartData = computed((): ChartData<'doughnut'> => {
    const p = this.payload();
    const colors = p.districts.labels.map((label, i) => districtSliceColor(label, i));
    return {
      labels: p.districts.labels.length ? p.districts.labels : ['No data'],
      datasets: [
        {
          data: p.districts.counts.length ? p.districts.counts : [1],
          backgroundColor: p.districts.labels.length ? colors : [ADMIN_CHART.grid],
          borderColor: 'rgba(24, 24, 27, 0.9)',
          borderWidth: 2,
          hoverOffset: 8,
        },
      ],
    };
  });

  readonly barChartData = computed((): ChartData<'bar'> => {
    const p = this.payload();
    return {
      labels: p.topDrivers.labels.length ? p.topDrivers.labels : ['No completed trips yet'],
      datasets: [
        {
          label: 'Completed trips',
          data: p.topDrivers.trips.length ? p.topDrivers.trips : [0],
          backgroundColor: ADMIN_CHART.accent,
          hoverBackgroundColor: ADMIN_CHART.primary,
          borderRadius: 6,
          maxBarThickness: 48,
        },
      ],
    };
  });

  readonly lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: darkChartPlugins(),
    scales: {
      x: axisStyle(),
      y: {
        ...axisStyle(),
        position: 'left',
        beginAtZero: true,
        title: { display: true, text: 'Orders', color: ADMIN_CHART.labelMuted, font: { size: 11 } },
      },
      y1: {
        ...axisStyle(),
        position: 'right',
        beginAtZero: true,
        grid: { color: ADMIN_CHART.grid, drawOnChartArea: false },
        title: { display: true, text: 'Revenue (€)', color: ADMIN_CHART.labelMuted, font: { size: 11 } },
      },
    },
  };

  readonly doughnutChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      ...darkChartPlugins(),
      legend: {
        position: 'bottom',
        labels: {
          color: ADMIN_CHART.labelMuted,
          padding: 14,
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
    },
  };

  readonly barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: darkChartPlugins(),
    indexAxis: 'x',
    scales: {
      x: {
        ...axisStyle(),
        ticks: {
          color: ADMIN_CHART.labelMuted,
          maxRotation: 45,
          minRotation: 0,
          autoSkip: false,
          font: { size: 10 },
        },
      },
      y: {
        ...axisStyle(),
        beginAtZero: true,
        ticks: { stepSize: 1, precision: 0 },
        title: { display: true, text: 'Trips', color: ADMIN_CHART.labelMuted, font: { size: 11 } },
      },
    },
  };

  readonly trendSummary = computed(() => {
    const p = this.payload();
    const orders = p.trend.orders.reduce((a, b) => a + b, 0);
    const revenue = p.trend.revenue.reduce((a, b) => a + b, 0);
    return { orders, revenue };
  });

  readonly platformLedger = computed(() => {
    const summary = this.summary();
    if (summary) return summary.ledger;
    const completed = this.orders().filter((o) => isCompletedOrderStatus(o.status));
    let grossTurnover = 0;
    let platformRevenue = 0;
    let driverEarnings = 0;
    for (const order of completed) {
      grossTurnover += Number(order.price) || 0;
      platformRevenue += platformCommissionForOrder(order);
      driverEarnings += driverNetEarningsForOrder(order);
    }
    return {
      grossTurnover: roundMoney(grossTurnover),
      platformRevenue: roundMoney(platformRevenue),
      driverEarnings: roundMoney(driverEarnings),
      completedCount: completed.length,
    };
  });

  readonly clientCount = computed(() => this.summary()?.clients ?? this.users().filter((user) => user.role === 'customer').length);

  readonly driverCount = computed(() => {
    const status = this.driverStatus();
    const summary = this.summary();
    if (summary) return summary.drivers[status];
    const drivers = this.users();
    if (status === 'all') return drivers.filter((user) => user.role === 'driver').length;
    if (status === 'verified') return drivers.filter((user) => driverMatchesFleetVerifiedTab(user)).length;
    if (status === 'pending') return drivers.filter((user) => driverMatchesFleetPendingTab(user)).length;
    return drivers.filter((user) => driverMatchesFleetNotVerifiedTab(user)).length;
  });

  readonly orderCount = computed(() => {
    const status = this.orderStatus();
    const summary = this.summary();
    if (summary) return summary.orders[status] ?? 0;
    const orders = this.orders();
    if (status === 'all') return orders.length;
    return orders.filter((order) => orderStatBucket(order) === status).length;
  });

  readonly trendPeriodLabel = computed(() => TREND_PERIOD_LABEL[this.trendRange()]);

  constructor() {
    effect(() => {
      const range = this.trendRange();
      untracked(() => this.loadCharts(range));
    });
    this.loadPlatformWallet();
  }

  loadPlatformWallet(): void {
    this.platformWalletLoading.set(true);
    this.platformWalletError.set('');
    this.walletService.getPlatformWallet().subscribe({
      next: (res) => {
        this.platformWalletAvailable.set(res.wallet.availableBalance);
        this.platformWalletLoading.set(false);
      },
      error: () => {
        this.platformWalletError.set('Could not load platform earnings');
        this.platformWalletLoading.set(false);
      },
    });
  }

  reload(): void {
    this.loadCharts(this.trendRange());
  }

  private loadCharts(range: AnalyticsTrendRange): void {
    this.adminService.getAnalytics({ range, skipGlobalErrorToast: true }).subscribe({
      next: (data) => {
        this.payload.set(data);
        this.summary.set(data.summary ?? null);
      },
    });
  }

  private lineFillGradient(
    ctx: CanvasRenderingContext2D,
    area?: { top: number; bottom: number },
  ): string | CanvasGradient {
    if (!area) return 'rgba(4, 116, 196, 0.15)';
    const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, 'rgba(4, 116, 196, 0.35)');
    g.addColorStop(1, 'rgba(4, 116, 196, 0)');
    return g;
  }
}

type AdminOrderStat =
  | 'all'
  | 'pending_payment'
  | 'pending_driver'
  | 'accepted'
  | 'on_the_way'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

function orderStatBucket(order: { status: string; paymentStatus?: string }): AdminOrderStat | null {
  const status = String(order.status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'pending') {
    return isOrderPaymentReadyForAccept(order) ? 'pending_driver' : 'pending_payment';
  }
  if (status === 'accepted') return 'accepted';
  if (status === 'driver_is_on_the_way') return 'on_the_way';
  if (status === 'picked_up' || status === 'in_progress' || status === 'delivery_in_progress') {
    return 'picked_up';
  }
  if (status === 'delivered' || status === 'completed') return 'delivered';
  return null;
}

const TREND_PERIOD_LABEL: Record<AnalyticsTrendRange, string> = {
  week: 'Per week',
  thisMonth: 'Per this month',
  month: 'Per month',
  threeMonths: 'Per 3 months',
  sixMonths: 'Per 6 months',
  year: 'Per year',
};

const DISTRICT_COLORS: Record<string, string> = {
  nicosia: '#3B82F6',
  limassol: '#22C55E',
  larnaca: '#F59E0B',
  paphos: '#A855F7',
  famagusta: '#06B6D4',
};

const DISTRICT_FALLBACK_COLORS = ['#F43F5E', '#14B8A6', '#6366F1', '#FB7185', '#EAB308'];

function districtSliceColor(label: string, index: number): string {
  return DISTRICT_COLORS[label.trim().toLowerCase()] ?? DISTRICT_FALLBACK_COLORS[index % DISTRICT_FALLBACK_COLORS.length];
}

function darkChartPlugins(): NonNullable<ChartOptions['plugins']> {
  return {
    legend: {
      labels: {
        color: ADMIN_CHART.label,
        font: { size: 12 },
        boxWidth: 12,
        padding: 16,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(24, 24, 27, 0.95)',
      titleColor: ADMIN_CHART.label,
      bodyColor: ADMIN_CHART.labelMuted,
      borderColor: ADMIN_CHART.grid,
      borderWidth: 1,
      padding: 10,
    },
  };
}

function axisStyle(): {
  grid: { color: string };
  ticks: { color: string; font: { size: number } };
  border: { color: string };
} {
  return {
    grid: { color: ADMIN_CHART.grid },
    ticks: { color: ADMIN_CHART.labelMuted, font: { size: 11 } },
    border: { color: ADMIN_CHART.grid },
  };
}
