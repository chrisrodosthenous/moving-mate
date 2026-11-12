import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
} from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { DialogService } from '../../../core/services/dialog.service';
import { UiButtonComponent } from '@/components/ui/button';
import { UiDialogBackdropComponent, UiDialogPanelComponent } from '@/components/ui/dialog';

@Component({
  selector: 'app-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiButtonComponent, UiDialogBackdropComponent, UiDialogPanelComponent],
  templateUrl: './dialog.component.html',
})
export class DialogComponent {
  readonly dialog = inject(DialogService);
  private readonly auth = inject(AuthService);
  readonly customerMuted = () => this.auth.user()?.role === 'customer';

  @HostListener('document:keydown', ['$event'])
  onEscape(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !this.dialog.visible()) {
      return;
    }
    e.preventDefault();
    this.dialog.onCancel();
  }

  onBackdrop(): void {
    this.dialog.onCancel();
  }
}
