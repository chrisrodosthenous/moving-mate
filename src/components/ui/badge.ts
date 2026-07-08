import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Logo brand green badge system */
export const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold leading-none transition duration-200 ease-in-out',
  {
    variants: {
      variant: {
        default: 'border-border/40 bg-secondary/40 text-muted-foreground',
        primary: 'border-primary/50 bg-primary/20 text-primary',
        success: 'border-primary/50 bg-primary/25 text-accent',
        warning: 'border-warning/40 bg-warning/15 text-foreground',
        destructive: 'border-primary/30 bg-destructive text-destructive-foreground',
        info: 'border-accent/50 bg-accent/15 text-accent',

        orderAccepted: 'border-accent/50 bg-accent/15 text-accent',
        orderInProgress: [
          'border-primary/55 bg-primary/25 text-primary',
          'shadow-[0_0_12px_rgba(34,197,94,0.15)]',
        ].join(' '),
        orderCompleted: 'border-primary/50 bg-primary/30 text-card-foreground',
        orderPending: 'border-border/50 bg-muted/40 text-muted-foreground',
        orderCancelled: 'border-[#243328] bg-background/85 text-[#6B7A68]',
      },
      surface: {
        light: '',
        dark: '',
      },
    },
    compoundVariants: [
      {
        variant: 'default',
        surface: 'light',
        class: 'border-secondary/50 bg-secondary/50 text-foreground',
      },
    ],
    defaultVariants: {
      variant: 'default',
      surface: 'dark',
    },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
export type BadgeSurface = NonNullable<VariantProps<typeof badgeVariants>['surface']>;

@Component({
  selector: 'ui-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <span [class]="classes()"><ng-content /></span> `,
})
export class UiBadgeComponent {
  readonly variant = input<BadgeVariant>('default');
  readonly surface = input<BadgeSurface>('dark');
  readonly className = input<string>('');

  readonly classes = computed(() =>
    cn(badgeVariants({ variant: this.variant(), surface: this.surface() }), this.className()),
  );
}
