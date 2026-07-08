import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

const TOAST_TTL_MS = 4000;

/**
 * Global in-app toasts. Prefer {@linkcode success}, {@linkcode error},
 * {@linkcode warning}, and {@linkcode info} for clarity.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toasts = signal<Toast[]>([]);
  private nextId = 0;

  readonly items = this.toasts.asReadonly();

  /** @param type - Semantic: success = emerald, error = rose, warning = amber, info = blue */
  show(message: string, type: ToastType = 'success', durationMs: number = TOAST_TTL_MS): void {
    const id = ++this.nextId;
    this.toasts.update((list) => [...list, { id, message, type }]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
  }

  success(message: string, durationMs?: number): void {
    this.show(message, 'success', durationMs);
  }

  error(message: string, durationMs?: number): void {
    this.show(message, 'error', durationMs);
  }

  warning(message: string, durationMs?: number): void {
    this.show(message, 'warning', durationMs);
  }

  info(message: string, durationMs?: number): void {
    this.show(message, 'info', durationMs);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
