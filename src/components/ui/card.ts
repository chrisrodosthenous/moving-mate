import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Logo green card system — semantic shadcn tokens: bg-card, text-card-foreground, border-border
 */
const cardBase = [
  'rounded-xl border border-border/30 bg-card/88 text-card-foreground backdrop-blur-sm',
  'shadow-[0_8px_32px_rgba(0,0,0,0.5)]',
].join(' ');

export const cardVariants = cva(cardBase, {
  variants: {
    elevated: {
      true: 'shadow-[0_8px_32px_rgba(0,0,0,0.65),_0_0_1px_rgba(34,197,94,0.1)]',
      false: '',
    },
  },
  defaultVariants: {
    elevated: false,
  },
});

export const cardHeaderVariants = cva('flex flex-col space-y-1.5 p-5');

export const cardTitleVariants = cva(
  'text-lg font-semibold leading-none tracking-tight text-card-foreground',
);

export const cardDescriptionVariants = cva('text-sm text-muted-foreground');

export const cardContentVariants = cva('p-5 pt-0', {
  variants: {
    padding: {
      default: 'p-5 pt-0',
      standalone: 'p-5',
      flush: 'p-0',
      relaxed: 'p-6',
    },
  },
  defaultVariants: { padding: 'default' },
});

export const cardFooterVariants = cva('flex items-center p-5 pt-0');

export type CardContentPadding = NonNullable<
  VariantProps<typeof cardContentVariants>['padding']
>;

@Component({
  selector: 'ui-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div [class]="classes()"><ng-content /></div> `,
})
export class UiCardComponent {
  readonly elevated = input<boolean>(false);
  readonly className = input<string>('');
  readonly classes = computed(() =>
    cn(cardVariants({ elevated: this.elevated() }), this.className()),
  );
}

@Component({
  selector: 'ui-card-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div [class]="classes()"><ng-content /></div> `,
})
export class UiCardHeaderComponent {
  readonly className = input<string>('');
  readonly classes = computed(() => cn(cardHeaderVariants(), this.className()));
}

@Component({
  selector: 'ui-card-title',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <h3 [attr.id]="id() || null" [class]="classes()"><ng-content /></h3> `,
})
export class UiCardTitleComponent {
  readonly id = input<string | null>(null);
  readonly className = input<string>('');
  readonly classes = computed(() => cn(cardTitleVariants(), this.className()));
}

@Component({
  selector: 'ui-card-description',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <p [class]="classes()"><ng-content /></p> `,
})
export class UiCardDescriptionComponent {
  readonly className = input<string>('');
  readonly classes = computed(() => cn(cardDescriptionVariants(), this.className()));
}

@Component({
  selector: 'ui-card-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div [class]="classes()"><ng-content /></div> `,
})
export class UiCardContentComponent {
  readonly padding = input<CardContentPadding>('default');
  readonly className = input<string>('');
  readonly classes = computed(() =>
    cn(cardContentVariants({ padding: this.padding() }), this.className()),
  );
}

@Component({
  selector: 'ui-card-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div [class]="classes()"><ng-content /></div> `,
})
export class UiCardFooterComponent {
  readonly className = input<string>('');
  readonly classes = computed(() => cn(cardFooterVariants(), this.className()));
}
