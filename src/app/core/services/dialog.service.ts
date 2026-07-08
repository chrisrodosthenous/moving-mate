import { Injectable, signal, computed } from '@angular/core';
import { Observable, Subject, take } from 'rxjs';

export interface DialogState {
  visible: boolean;
  message: string;
  title?: string;
}

/**
 * Global modal/confirm API. Injected as {@linkcode DialogService} or
 * `ConfirmDialogService` (alias) for existing code.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly st = signal<DialogState>({
    visible: false,
    message: '',
    title: undefined,
  });

  private activeResult: Subject<boolean> | undefined = undefined;

  readonly visible = computed(() => this.st().visible);
  readonly message = computed(() => this.st().message);
  readonly title = computed(() => this.st().title);

  /**
   * Opens a confirm dialog. Emits `true` on confirm, `false` on cancel, backdrop, Escape,
   * or if superseded by another `confirm()` call, then completes.
   */
  confirm(message: string, title?: string): Observable<boolean> {
    if (this.activeResult) {
      const prev = this.activeResult;
      this.activeResult = undefined;
      prev.next(false);
      prev.complete();
    }
    this.st.set({ visible: true, message, title });
    this.activeResult = new Subject<boolean>();
    return this.activeResult.asObservable().pipe(take(1));
  }

  onConfirm(): void {
    this.finish(true);
  }

  onCancel(): void {
    this.finish(false);
  }

  private finish(value: boolean): void {
    this.st.set({ visible: false, message: '', title: undefined });
    const s = this.activeResult;
    this.activeResult = undefined;
    s?.next(value);
    s?.complete();
  }
}
