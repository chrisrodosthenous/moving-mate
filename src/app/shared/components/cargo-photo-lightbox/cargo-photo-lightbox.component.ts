import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Full-screen cargo preview using the native `<dialog>` API.
 * Parent controls visibility (e.g. `@if (url) { <app-cargo-photo-lightbox [imageUrl]="url" (closed)="..." /> }`).
 */
@Component({
  selector: 'app-cargo-photo-lightbox',
  standalone: true,
  templateUrl: './cargo-photo-lightbox.component.html',
  styleUrl: './cargo-photo-lightbox.component.css',
})
export class CargoPhotoLightboxComponent {
  private readonly injector = inject(Injector);

  readonly imageUrl = input.required<string>();
  readonly closed = output<void>();

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    afterNextRender(
      () => {
        this.dialogRef().nativeElement.showModal();
      },
      { injector: this.injector },
    );
  }

  close(): void {
    this.dialogRef().nativeElement.close();
  }

  onDialogClose(): void {
    this.closed.emit();
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }
}
