import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Logo brand green button system */
const btnBase = [
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold',
  'transition-all duration-300 ease-in-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'disabled:pointer-events-none disabled:opacity-50',
].join(' ');

export const buttonVariants = cva(btnBase, {
  variants: {
    variant: {
      default: [
        'bg-primary text-primary-foreground',
        'shadow-[0_4px_14px_rgba(34,197,94,0.35)]',
        'hover:bg-[#16A34A] hover:shadow-[0_6px_20px_rgba(34,197,94,0.50)] hover:-translate-y-0.5',
        'active:translate-y-0 active:shadow-[0_2px_8px_rgba(34,197,94,0.30)]',
      ].join(' '),

      secondary: [
        'bg-secondary/55 backdrop-blur-sm text-secondary-foreground',
        'shadow-[0_4px_12px_rgba(0,0,0,0.45)]',
        'hover:bg-secondary/80 hover:shadow-[0_6px_16px_rgba(0,0,0,0.55)] hover:-translate-y-0.5',
        'active:translate-y-0',
      ].join(' '),

      outline: [
        'border border-border/60 bg-transparent text-muted-foreground',
        'hover:bg-secondary/20 hover:text-foreground hover:border-primary/50',
        'hover:-translate-y-0.5',
        'active:translate-y-0',
      ].join(' '),

      ghost: [
        'text-muted-foreground',
        'hover:bg-secondary/20 hover:text-foreground',
      ].join(' '),

      destructive: [
        'bg-destructive text-destructive-foreground border border-primary/30',
        'shadow-[0_4px_14px_rgba(26,61,42,0.45)]',
        'hover:bg-destructive/90 hover:shadow-[0_6px_20px_rgba(26,61,42,0.55)] hover:-translate-y-0.5',
        'active:translate-y-0',
      ].join(' '),

      link: [
        'text-primary underline-offset-4',
        'hover:underline hover:text-accent',
      ].join(' '),
    },

    size: {
      default: 'h-10 px-4 py-2',
      sm: 'h-9 px-3 text-xs',
      lg: 'h-11 px-8 text-base',
      xl: 'h-12 px-10 text-base',
      icon: 'h-10 w-10',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

@Component({
  selector: 'ui-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button [attr.type]="type()" [disabled]="disabled()" [class]="classes()">
      <ng-content />
    </button>
  `,
})
export class UiButtonComponent {
  readonly variant = input<ButtonVariant>('default');
  readonly size = input<ButtonSize>('default');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly className = input<string>('');

  readonly classes = computed(() =>
    cn(
      buttonVariants({ variant: this.variant(), size: this.size() }),
      this.className(),
    ),
  );
}
