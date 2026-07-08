import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { cn } from '@/lib/utils';

/** Brand logo served from `public/logo.png`. */
export const APP_LOGO_SRC = '/logo.png';
export const APP_LOGO_ALT = 'MovingMate';

export type AppLogoSize = 'sm' | 'md' | 'lg' | 'sidebar' | 'sidebar-compact';

/** Runner glyph bounds inside the square PNG (icon + wordmark band). */
const RUNNER_VIEW_BOX = 'inset(43% 68% 44% 16%)';

const MARK_PRESET = {
  sidebar: {
    viewport: 'logo-mark-viewport--sidebar',
    img: 'logo-mark-img--sidebar',
    /** Center runner in viewport: 23.85% × 50% of 14rem source. */
    fallbackTransform: 'translate(-3.34rem, -7rem)',
    source: '14rem',
  },
  'sidebar-compact': {
    viewport: 'logo-mark-viewport--sidebar-compact',
    img: 'logo-mark-img--sidebar-compact',
    fallbackTransform: 'translate(-2.62rem, -5.5rem)',
    source: '11rem',
  },
} as const;

@Component({
  selector: 'app-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        flex-shrink: 0;
      }

      /* Square PNG: trim empty padding, keep full wordmark visible. */
      .logo-wordmark-shell {
        position: relative;
        overflow: hidden;
        display: block;
        flex-shrink: 0;
      }

      .logo-wordmark-img {
        position: absolute;
        top: 50%;
        left: 0;
        width: auto;
        max-width: none;
        clip-path: inset(37% 8% 37% 8%);
        transform: translateY(-50%);
      }

      .logo-wordmark-shell--sidebar {
        height: 2.5rem;
        width: 11.25rem;
      }

      .logo-wordmark-shell--sidebar .logo-wordmark-img {
        height: 14rem;
        margin-left: -1.12rem;
      }

      .logo-wordmark-shell--sidebar-compact {
        height: 2rem;
        width: 8.75rem;
      }

      .logo-wordmark-shell--sidebar-compact .logo-wordmark-img {
        height: 11rem;
        margin-left: -0.88rem;
      }

      .logo-wordmark-shell--lg {
        height: 3rem;
        width: 13rem;
      }

      @media (min-width: 640px) {
        .logo-wordmark-shell--lg {
          height: 3.25rem;
          width: 14rem;
        }
      }

      .logo-wordmark-shell--lg .logo-wordmark-img {
        height: 16rem;
        margin-left: -1.28rem;
      }

      @media (min-width: 640px) {
        .logo-wordmark-shell--lg .logo-wordmark-img {
          height: 17rem;
          margin-left: -1.36rem;
        }
      }

      /* Collapsed mark — square frame, runner centered (same height as wordmark). */
      .logo-mark-viewport {
        position: relative;
        display: block;
        flex-shrink: 0;
        overflow: hidden;
        margin-inline: auto;
      }

      .logo-mark-viewport--sidebar {
        height: 2.5rem;
        width: 2.5rem;
      }

      .logo-mark-viewport--sidebar-compact {
        height: 2rem;
        width: 2rem;
      }

      .logo-mark-img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
        object-view-box: ${RUNNER_VIEW_BOX};
      }

      /* Browsers without object-view-box: pin runner centroid to viewport center. */
      @supports not (object-view-box: inset(0)) {
        .logo-mark-img {
          position: absolute;
          top: 50%;
          left: 50%;
          width: var(--logo-mark-source, 14rem);
          height: var(--logo-mark-source, 14rem);
          object-fit: none;
          object-view-box: unset;
          clip-path: inset(43% 68% 44% 16%);
        }

        .logo-mark-img--sidebar {
          --logo-mark-source: 14rem;
          transform: translate(-3.34rem, -7rem);
        }

        .logo-mark-img--sidebar-compact {
          --logo-mark-source: 11rem;
          transform: translate(-2.62rem, -5.5rem);
        }
      }
    `,
  ],
  template: `
    @if (variant() === 'mark') {
      <span [class]="markViewportClass()" aria-hidden="true">
        <img [src]="src()" alt="" [class]="markImgClass()" decoding="async" />
      </span>
    } @else if (useCrop()) {
      <span [class]="fullShellClass()">
        <img
          [src]="src()"
          [attr.alt]="alt()"
          class="logo-wordmark-img"
          decoding="async"
        />
      </span>
    } @else {
      <img
        [src]="src()"
        [attr.alt]="alt()"
        class="block w-auto max-w-full object-contain object-left"
        [class]="fullClass()"
        decoding="async"
      />
    }
  `,
})
export class AppLogoComponent {
  /** `full` — wordmark; `mark` — runner icon (collapsed sidebar). */
  readonly variant = input<'full' | 'mark'>('full');
  readonly size = input<AppLogoSize>('md');
  readonly alt = input(APP_LOGO_ALT);
  readonly src = input(APP_LOGO_SRC);
  readonly className = input('');

  /** Square PNG has heavy padding — trim padding only for sidebar/auth. */
  useCrop(): boolean {
    const s = this.size();
    return this.variant() === 'full' && (s === 'sidebar' || s === 'sidebar-compact' || s === 'lg');
  }

  markViewportClass(): string {
    const preset = MARK_PRESET[this.size() as keyof typeof MARK_PRESET] ?? MARK_PRESET.sidebar;
    return cn('logo-mark-viewport', preset.viewport);
  }

  markImgClass(): string {
    const preset = MARK_PRESET[this.size() as keyof typeof MARK_PRESET] ?? MARK_PRESET.sidebar;
    return cn('logo-mark-img', preset.img);
  }

  fullShellClass(): string {
    const shells: Record<string, string> = {
      sidebar: 'logo-wordmark-shell logo-wordmark-shell--sidebar',
      'sidebar-compact': 'logo-wordmark-shell logo-wordmark-shell--sidebar-compact',
      lg: 'logo-wordmark-shell logo-wordmark-shell--lg',
    };
    return cn(shells[this.size()] ?? shells['sidebar'], this.className());
  }

  fullClass(): string {
    const h = this.size() === 'sm' ? 'h-7' : 'h-8';
    return cn(h, 'max-w-[10.5rem]', this.className());
  }
}
