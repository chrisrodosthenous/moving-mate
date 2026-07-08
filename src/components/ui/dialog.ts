import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Logo green dialog system — backdrop blur + card panel tokens
 */

/**
 * Backdrop (fade-in, 300ms) for modal overlays.
 */
@Component({
  selector: 'ui-dialog-backdrop',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'absolute inset-0 z-0 block animate-fade-in bg-background/80 backdrop-blur-sm',
    'aria-hidden': 'true',
  },
  template: `<!-- backdrop -->`,
})
export class UiDialogBackdropComponent {}

/**
 * Centered panel (scale-in, 300ms) with card styling and elevated shadow.
 */
@Component({
  selector: 'ui-dialog-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative z-[1] block w-full max-w-md animate-scale-in rounded-xl border border-border/30 bg-card/95 p-6 text-card-foreground font-sans backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.65)]',
  },
  template: ` <ng-content /> `,
})
export class UiDialogPanelComponent {}
