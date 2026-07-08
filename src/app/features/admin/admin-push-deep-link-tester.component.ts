import { Component, inject, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { FcmService } from '../../core/services/fcm.service';
import { slideInTesterCards } from './admin-animations';

export interface DeepLinkTestButton {
  label: string;
  url: string;
  title: string;
  body: string;
}

const CUSTOMER_TESTS: DeepLinkTestButton[] = [
  {
    label: 'Test: Order Accepted',
    url: '/my-orders',
    title: 'Order Accepted!',
    body: 'Your driver has been assigned to your order.',
  },
  {
    label: 'Test: In Transit',
    url: '/my-orders',
    title: 'Driver is on the way!',
    body: 'Your driver is heading to your location.',
  },
  {
    label: 'Test: Delivery Rating',
    url: '/rate-driver/test-id',
    title: 'Order Completed',
    body: 'How was your experience? Tap here to rate your driver.',
  },
];

const DRIVER_TESTS: DeepLinkTestButton[] = [
  {
    label: 'Test: New Available Order',
    url: '/driver/available',
    title: 'New Order Available!',
    body: 'A new job is available in your area. Tap to view.',
  },
  {
    label: 'Test: Chat Message',
    url: '/chat/test-id',
    title: 'New Message',
    body: 'You have a new chat message.',
  },
];

const ADMIN_TESTS: DeepLinkTestButton[] = [
  {
    label: 'Test: Driver Verification',
    url: '/admin/verify-drivers',
    title: 'New Verification Request',
    body: 'A driver has submitted documents for review.',
  },
];

/** All presets for the scenario dropdown (same set as the simulation buttons). */
const ALL_PRESETS: DeepLinkTestButton[] = [
  ...CUSTOMER_TESTS,
  ...DRIVER_TESTS,
  ...ADMIN_TESTS,
];

@Component({
  selector: 'app-admin-push-deep-link-tester',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  animations: [slideInTesterCards],
  template: `
    <div class="admin-theme-surface rounded-2xl shadow-surface">
      <div class="border-b border-border/25 px-5 py-4">
        <h2 class="text-lg font-semibold text-foreground">Push Notification Deep-Link Tester</h2>
        <p class="mt-0.5 text-xs text-primary">
          Sends a real push to your devices. Tap the notification to verify where it navigates.
        </p>
        <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label class="block min-w-[min(100%,280px)] flex-1">
            <span class="mb-1 block text-xs font-medium text-foreground">Scenario (dropdown)</span>
            <select
              [ngModel]="selectedPresetLabel()"
              (ngModelChange)="onPresetSelect($event)"
              class="w-full rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              @for (p of allPresets; track p.label) {
                <option [value]="p.label">{{ p.label }} — {{ p.url }}</option>
              }
            </select>
          </label>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
            [disabled]="!!sendingKey() || !selectedPreset()"
            (click)="sendSelectedPreset()"
          >
            @if (sendingKey() === 'dropdown') {
              <lucide-icon name="loader-2" class="h-4 w-4 animate-spin" aria-hidden="true" />
            } @else {
              <lucide-icon name="send" class="h-4 w-4" aria-hidden="true" />
            }
            Send selected
          </button>
        </div>
      </div>
      <div class="grid gap-4 p-5 md:grid-cols-3" [@slideInTesterCards]>
        <div class="tester-card rounded-xl border border-primary/30 bg-primary/10 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-primary">Customer Notifications</p>
          <div class="mt-3 flex flex-col gap-2">
            @for (btn of customerTests; track btn.label) {
              <button
                type="button"
                [disabled]="!!sendingKey()"
                (click)="send('customer:' + btn.label, btn)"
                class="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/80 px-3 py-2 text-left text-xs font-medium text-foreground shadow-sm transition hover:bg-secondary/25 disabled:opacity-50"
              >
                @if (sendingKey() === 'customer:' + btn.label) {
                  <lucide-icon name="loader-2" class="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                } @else {
                  <lucide-icon name="send" class="h-3.5 w-3.5 shrink-0 text-primary" />
                }
                {{ btn.label }}
                <code class="ml-1 rounded bg-secondary/25 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{{
                  btn.url
                }}</code>
              </button>
            }
          </div>
        </div>
        <div class="tester-card rounded-xl border border-primary/25 bg-warning/15 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-foreground">Driver Notifications</p>
          <div class="mt-3 flex flex-col gap-2">
            @for (btn of driverTests; track btn.label) {
              <button
                type="button"
                [disabled]="!!sendingKey()"
                (click)="send('driver:' + btn.label, btn)"
                class="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/80 px-3 py-2 text-left text-xs font-medium text-foreground shadow-sm transition hover:bg-secondary/25 disabled:opacity-50"
              >
                @if (sendingKey() === 'driver:' + btn.label) {
                  <lucide-icon name="loader-2" class="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                } @else {
                  <lucide-icon name="send" class="h-3.5 w-3.5 shrink-0 text-primary" />
                }
                {{ btn.label }}
                <code class="ml-1 rounded bg-secondary/25 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{{
                  btn.url
                }}</code>
              </button>
            }
          </div>
        </div>
        <div class="tester-card rounded-xl border border-border/35 bg-muted/60 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-primary">Admin Notifications</p>
          <div class="mt-3 flex flex-col gap-2">
            @for (btn of adminTests; track btn.label) {
              <button
                type="button"
                [disabled]="!!sendingKey()"
                (click)="send('admin:' + btn.label, btn)"
                class="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/80 px-3 py-2 text-left text-xs font-medium text-foreground shadow-sm transition hover:bg-secondary/25 disabled:opacity-50"
              >
                @if (sendingKey() === 'admin:' + btn.label) {
                  <lucide-icon name="loader-2" class="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                } @else {
                  <lucide-icon name="send" class="h-3.5 w-3.5 shrink-0 text-primary" />
                }
                {{ btn.label }}
                <code class="ml-1 rounded bg-secondary/25 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{{
                  btn.url
                }}</code>
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminPushDeepLinkTesterComponent {
  private readonly http = inject(HttpClient);
  private readonly fcm = inject(FcmService);

  readonly toast = output<{ message: string; variant: 'success' | 'error' }>();

  readonly customerTests = CUSTOMER_TESTS;
  readonly driverTests = DRIVER_TESTS;
  readonly adminTests = ADMIN_TESTS;
  readonly allPresets = ALL_PRESETS;

  readonly sendingKey = signal<string | null>(null);
  readonly selectedPresetLabel = signal<string>(ALL_PRESETS[0]?.label ?? '');
  readonly selectedPreset = signal<DeepLinkTestButton | null>(ALL_PRESETS[0] ?? null);

  onPresetSelect(label: string): void {
    this.selectedPresetLabel.set(label);
    this.selectedPreset.set(ALL_PRESETS.find((p) => p.label === label) ?? null);
  }

  async sendSelectedPreset(): Promise<void> {
    const btn = this.selectedPreset();
    if (!btn) return;
    await this.send('dropdown', btn);
  }

  async send(key: string, btn: DeepLinkTestButton): Promise<void> {
    if (this.sendingKey()) return;
    this.sendingKey.set(key);
    try {
      await this.fcm.registerToken().catch(() => {});
      await this.fcm.syncStoredTokenToBackend();
      const res = await firstValueFrom(
        this.http.post<{ message?: string }>('/api/admin/notifications/deep-link-test', {
          url: btn.url,
          title: btn.title,
          body: btn.body,
        }),
      );
      this.toast.emit({
        message: res?.message || `Push sent → ${btn.url}`,
        variant: 'success',
      });
    } catch {
      /* Error toast: httpErrorInterceptor */
    } finally {
      this.sendingKey.set(null);
    }
  }
}
