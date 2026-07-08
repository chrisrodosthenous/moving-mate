import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/** Injected via MatDialog.open(..., { data }) */
export interface RejectDriverDialogData {
  driverName: string;
}

@Component({
  selector: 'app-reject-driver-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
  ],
  templateUrl: './reject-driver-dialog.component.html',
  styleUrl: './reject-driver-dialog.component.css',
})
export class RejectDriverDialogComponent {
  readonly data = inject<RejectDriverDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<RejectDriverDialogComponent, string | undefined>,
  );

  /** Bound to textarea; submitted trimmed non-empty string closes dialog. */
  reason = '';

  /** True after blur or submit attempt — drives inline validation message. */
  reasonTouched = false;

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  onReasonBlur(): void {
    this.reasonTouched = true;
  }

  submit(): void {
    this.reasonTouched = true;
    const trimmed = this.reason.trim();
    if (!trimmed) return;
    this.dialogRef.close(trimmed);
  }
}
