import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { badgeVariants, type BadgeVariant } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ToastType, ToastService } from '../../../core/services/toast.service';

const TOAST_TYPE_VARIANT: Record<ToastType, BadgeVariant> = {
  success: 'success',
  error: 'destructive',
  warning: 'warning',
  info: 'default',
};

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.css',
  animations: [
    trigger('toastMotion', [
      transition(':enter', [
        style({ transform: 'translate3d(100%, 0, 0)', opacity: 0 }),
        animate(
          '300ms ease-in-out',
          style({ transform: 'translate3d(0, 0, 0)', opacity: 1 }),
        ),
      ]),
      transition(':leave', [
        animate(
          '200ms ease-in',
          style({ transform: 'translate3d(0.5rem, 0, 0)', opacity: 0 }),
        ),
      ]),
    ]),
  ],
})
export class ToastComponent {
  readonly toast = inject(ToastService);

  /** Aligned with {@linkcode badgeVariants} (light) — success = emerald, error = rose. */
  classForType(type: ToastType): string {
    return cn(
      badgeVariants({ variant: TOAST_TYPE_VARIANT[type], surface: 'light' }),
      'pointer-events-auto flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-sans antialiased leading-snug shadow-md',
      '[text-wrap:balance]',
    );
  }
}
