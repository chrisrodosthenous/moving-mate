import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

const STORAGE_KEY = 'mm_cookie_notice_dismissed';

@Component({
  selector: 'app-cookie-notice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (visible()) {
      <div
        class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 sm:p-4"
        role="region"
        aria-label="Cookie notice"
      >
        <div
          class="pointer-events-auto flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-border/60 bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <p class="text-sm leading-relaxed text-muted-foreground">
            We use essential storage to keep you signed in and, if you allow it, push notifications and maps.
            See our
            <a routerLink="/cookies" class="font-medium text-primary underline-offset-2 hover:underline">cookie notice</a>
            and
            <a routerLink="/privacy" class="font-medium text-primary underline-offset-2 hover:underline">privacy policy</a>.
          </p>
          <button
            type="button"
            class="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            (click)="dismiss()"
          >
            Got it
          </button>
        </div>
      </div>
    }
  `,
})
export class CookieNoticeComponent {
  readonly visible = signal(this.shouldShow());

  dismiss(): void {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* private mode — still hide for this session */
    }
    this.visible.set(false);
  }

  private shouldShow(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
      return true;
    }
  }
}
