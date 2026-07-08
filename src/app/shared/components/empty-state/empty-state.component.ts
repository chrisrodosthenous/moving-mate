import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Consistent empty-list / empty-panel copy. Optional projected content for CTAs (links, buttons).
 *
 * Use `tone="admin"` inside the dark admin shell; default uses theme tokens (muted text, surface cards).
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [ngClass]="shellClass()" role="status">
      <p [ngClass]="titleClass()">
        {{ title() }}
      </p>
      @if (hint()) {
        <p [ngClass]="hintClass()">
          {{ hint() }}
        </p>
      }
      <div class="mt-4 flex flex-col items-center justify-center gap-2">
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly hint = input<string>();
  /** `dashed` — compact panel; `card` — solid border + padding (e.g. primary empty screens). */
  readonly surface = input<'dashed' | 'card'>('dashed');
  /** `admin` — borders/text for dark admin sidebar / panels. */
  readonly tone = input<'default' | 'admin'>('default');

  readonly shellClass = computed(() => {
    if (this.tone() === 'admin') {
      return this.surface() === 'card'
        ? 'rounded-lg border border-border/60 bg-card/85 backdrop-blur-sm px-4 py-6 text-center md:px-5'
        : 'rounded-lg border border-dashed border-border/60 bg-muted/45 px-3 py-5 text-center';
    }
    return this.surface() === 'card'
      ? 'rounded-xl border border-border/45 bg-card/85 backdrop-blur-sm p-8 text-center md:p-12'
      : 'rounded-xl border border-dashed border-border/50 bg-muted/40 px-6 py-10 text-center';
  });

  readonly titleClass = computed(() => {
    if (this.tone() === 'admin') {
      return this.surface() === 'card'
        ? 'text-sm font-medium text-ice mb-1'
        : 'text-sm font-medium text-muted';
    }
    return this.surface() === 'card'
      ? 'text-lg font-medium text-card-title mb-2'
      : 'text-sm font-medium text-ice';
  });

  readonly hintClass = computed(() => {
    if (this.tone() === 'admin') {
      return this.surface() === 'card' ? 'text-xs text-muted' : 'mt-1 text-xs text-muted';
    }
    return this.surface() === 'card' ? 'text-sm text-muted' : 'mt-2 text-xs text-muted';
  });
}
