import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { AdminService } from '../../../core/services/admin.service';

@Component({
  selector: 'app-private-doc-image',
  standalone: true,
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="alt()" [class]="imgClass()" />
    }
  `,
})
export class PrivateDocImageComponent {
  private readonly admin = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);
  private objectUrl: string | null = null;

  readonly userId = input.required<string>();
  readonly docType = input.required<'license' | 'vehicle-photo' | 'id-card'>();
  readonly alt = input('Document');
  readonly imgClass = input('');
  readonly src = signal<string | null>(null);

  private seq = 0;

  constructor() {
    effect(() => {
      const userId = this.userId();
      const docType = this.docType();
      const current = ++this.seq;
      this.revoke();
      this.admin.getPrivateDocument(userId, docType).subscribe({
        next: (blob) => {
          if (current !== this.seq) return;
          const url = URL.createObjectURL(blob);
          this.objectUrl = url;
          this.src.set(url);
        },
        error: () => {
          if (current !== this.seq) return;
          this.src.set(null);
        },
      });
    });
    this.destroyRef.onDestroy(() => this.revoke());
  }

  private revoke(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.src.set(null);
  }
}
