import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { catchError, EMPTY } from 'rxjs';
import type { AdminAnalyticsPayload, AdminOrder } from '../../../core/services/admin.service';
import { AdminService } from '../../../core/services/admin.service';
import { WalletService } from '../../../core/services/wallet.service';
import { UiButtonComponent } from '@/components/ui/button';
import { ADMIN_CHART, ADMIN_CHART_SLICE_COLORS } from '../../../core/constants/admin-chart-theme';
import { buildAnalyticsFromOrders, emptyAnalyticsPayload } from './admin-analytics.utils';
import {
  isCompletedOrderStatus,
  platformCommissionForOrder,
} from '../../../shared/utils/order-commission.util';
import { roundMoney } from '../../../shared/utils/order-pricing.util';

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [BaseChartDirective, DecimalPipe, FormsModule, UiButtonComponent],
  templateUrl: './admin-analytics.component.html',
})
export class AdminAnalyticsComponent {
  private readonly adminService = inject(AdminService);
  private readonly walletService = inject(WalletService);

  readonly orders = input<AdminOrder[]>([]);
  readonly loading = input(false);

  readonly platformWalletAvailable = signal(0);
  readonly platformWalletWithdrawn = signal(0);
  readonly platformWalletLoading = signal(false);
  readonly platformWithdrawAmount = signal('');
  readonly platformWithdrawLoading = signal(false);
  readonly platformWalletError = signal('');

  private readonly payload = signal<AdminAnalyticsPayload>(emptyAnalyticsPayload());

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
    const colors = p.districts.labels.map((_, i) => ADMIN_CHART_SLICE_COLORS[i % ADMIN_CHART_SLICE_COLORS.length]);
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

  /** Aggregated platform ledger from all completed orders in overview. */
  readonly platformLedger = computed(() => {
    const completed = this.orders().filter((o) => isCompletedOrderStatus(o.status));
    let grossTurnover = 0;
    let platformRevenue = 0;
    for (const order of completed) {
      grossTurnover += Number(order.price) || 0;
      platformRevenue += platformCommissionForOrder(order);
    }
    return {
      grossTurnover: roundMoney(grossTurnover),
      platformRevenue: roundMoney(platformRevenue),
      completedCount: completed.length,
    };
  });

  constructor() {
    effect(() => {
      const list = this.orders();
      if (list.length === 0) return;
      untracked(() => this.payload.set(buildAnalyticsFromOrders(list)));
    });
    this.loadPlatformWallet();
  }

  loadPlatformWallet(): void {
    this.platformWalletLoading.set(true);
    this.platformWalletError.set('');
    this.walletService.getPlatformWallet().subscribe({
      next: (res) => {
        this.platformWalletAvailable.set(res.wallet.availableBalance);
        this.platformWalletWithdrawn.set(res.wallet.totalWithdrawn ?? 0);
        this.platformWalletLoading.set(false);
      },
      error: () => {
        this.platformWalletError.set('Could not load platform wallet');
        this.platformWalletLoading.set(false);
      },
    });
  }

  submitPlatformWithdraw(): void {
    const amount = Number(String(this.platformWithdrawAmount()).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      this.platformWalletError.set('Enter a valid amount');
      return;
    }
    this.platformWithdrawLoading.set(true);
    this.platformWalletError.set('');
    this.walletService.withdrawPlatformFunds(amount).subscribe({
      next: (res) => {
        this.platformWalletAvailable.set(res.wallet.availableBalance);
        this.platformWalletWithdrawn.set(res.wallet.totalWithdrawn ?? 0);
        this.platformWithdrawAmount.set('');
        this.platformWithdrawLoading.set(false);
      },
      error: (err) => {
        this.platformWalletError.set(err?.error?.message ?? 'Withdrawal failed');
        this.platformWithdrawLoading.set(false);
      },
    });
  }

  reload(): void {
    const list = this.orders();
    if (list.length > 0) {
      this.payload.set(buildAnalyticsFromOrders(list));
      return;
    }
    this.adminService
      .getAnalytics({ skipGlobalErrorToast: true })
      .pipe(catchError(() => EMPTY))
      .subscribe((data) => this.payload.set(data));
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
