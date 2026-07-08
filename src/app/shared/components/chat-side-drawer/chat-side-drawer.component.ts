import {
  Component,
  effect,
  HostListener,
  inject,
  input,
  output,
  signal,
  OnDestroy,
} from '@angular/core';
import { ChatWindowComponent } from '../chat-window/chat-window.component';
import type { TransportOrder } from '../../../core/services/orders.service';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Right-side overlay for order chat with dimmed backdrop. Use with any role that has
 * `TransportOrder` + viewer id (customer, driver, or future admin order view).
 */
@Component({
  selector: 'app-chat-side-drawer',
  standalone: true,
  imports: [ChatWindowComponent],
  templateUrl: './chat-side-drawer.component.html',
})
export class ChatSideDrawerComponent implements OnDestroy {
  readonly order = input<TransportOrder | null>(null);
  /** Optional; when empty, falls back to `AuthService.user().id` (same store for customer/driver/admin). */
  readonly currentUserId = input<string>('');

  /** After close animation — parent should `chatOrder.set(null)` / clear state here. */
  readonly drawerClosed = output<void>();

  private readonly auth = inject(AuthService);

  readonly sheetOpen = signal(false);

  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private closedNotified = false;

  constructor() {
    effect(() => {
      const o = this.order();
      if (o?._id) {
        this.closedNotified = false;
        queueMicrotask(() => this.sheetOpen.set(true));
      }
    });
  }

  resolvedViewerId(): string {
    const fromInput = String(this.currentUserId() ?? '').trim();
    if (fromInput) return fromInput;
    return String(this.auth.user()?.id ?? '').trim();
  }

  ngOnDestroy(): void {
    this.clearCloseTimer();
  }

  beginClose(): void {
    if (this.closedNotified) return;
    if (!this.sheetOpen()) {
      this.closedNotified = true;
      this.drawerClosed.emit();
      return;
    }
    this.sheetOpen.set(false);
    this.clearCloseTimer();
    this.closeTimer = setTimeout(() => {
      if (this.closedNotified) return;
      this.closedNotified = true;
      this.drawerClosed.emit();
    }, 320);
  }

  private clearCloseTimer(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.order() && !this.closedNotified) {
      this.beginClose();
    }
  }
}
