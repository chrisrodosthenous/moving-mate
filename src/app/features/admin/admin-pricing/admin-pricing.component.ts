import { DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AdminService, type AdminPricingPreview } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-pricing',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './admin-pricing.component.html',
})
export class AdminPricingComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly fb = inject(FormBuilder);

  readonly preview = signal<AdminPricingPreview[]>([]);
  readonly version = signal(1);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    dieselPricePerLitreEur: 1.783,
    driverHourlyTargetEur: 18,
    helperHourlyRateEur: 15,
  });

  ngOnInit(): void {
    this.admin.getPricingConfig().subscribe({
      next: (res) => {
        this.form.patchValue({
          dieselPricePerLitreEur: res.config.dieselPricePerLitreEur,
          driverHourlyTargetEur: res.config.driverHourlyTargetEur,
          helperHourlyRateEur: res.config.helperHourlyRateEur,
        });
        this.preview.set(res.preview);
        this.version.set(res.version);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load pricing settings.');
        this.loading.set(false);
      },
    });
  }

  refreshPreview(): void {
    this.error.set('');
    this.admin.previewPricingConfig({ config: this.form.getRawValue() }).subscribe({
      next: (res) => this.preview.set(res.preview),
      error: () => this.error.set('Could not preview these values.'),
    });
  }

  save(): void {
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    this.admin.updatePricingConfig({ config: this.form.getRawValue() }).subscribe({
      next: (res) => {
        this.preview.set(res.preview);
        this.version.set(res.version);
        this.message.set('Saved. New quotes use these values. Quotes already issued keep their price.');
        this.saving.set(false);
      },
      error: () => {
        this.error.set('Could not save pricing settings.');
        this.saving.set(false);
      },
    });
  }
}
