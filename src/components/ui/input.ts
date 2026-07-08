import { Directive, HostBinding, input } from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Logo green input system — semantic shadcn tokens: bg-input, border-border, ring-ring
 */
export const inputVariants = cva(
  [
    'flex w-full min-w-0 appearance-none rounded-lg',
    'border border-border/50 bg-input/70 px-3 py-2',
    'text-sm text-foreground',
    'shadow-sm',
    'transition-all duration-300 ease-in-out',
    'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-muted-foreground',
    'placeholder:text-muted-foreground/60',
    'focus-visible:border-primary focus-visible:outline-none',
    'focus-visible:ring-2 focus-visible:ring-ring',
    'focus-visible:shadow-[0_0_10px_rgba(34,197,94,0.15)]',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ].join(' '),
);

export type InputFieldVariantProps = VariantProps<typeof inputVariants>;

@Directive({
  selector: 'input[uiInput],textarea[uiInput],select[uiInput]',
  standalone: true,
  host: {
    '[attr.data-ui-input]': 'true',
  },
})
export class UiInputDirective {
  readonly className = input<string>('');

  @HostBinding('class')
  get hostClass(): string {
    return cn(inputVariants(), this.className());
  }
}
