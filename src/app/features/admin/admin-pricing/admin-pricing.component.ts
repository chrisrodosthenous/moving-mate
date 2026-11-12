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
  });

  ngOnInit(): void {
    this.admin.getPricingConfig().subscribe({
      next: (res) => {
        this.form.patchValue({
          dieselPricePerLitreEur: res.config.dieselPricePerLitreEur,
          driverHourlyTargetEur: res.config.driverHourlyTargetEur,
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

  basisLabel(basis: string): string {
    if (basis === 'cost_floor') return 'Cost floor';
    if (basis === 'minimum_fare') return 'Minimum fare';
    return 'Rate card';
  }

  refreshPreview(): void {
    const invalid = this.invalidReason();
    this.message.set('');
    if (invalid) {
      this.error.set(invalid);
      return;
    }
    this.error.set('');
    this.admin.previewPricingConfig({ config: this.configPayload() }).subscribe({
      next: (res) => this.preview.set(res.preview),
      error: () => this.error.set('Could not preview these values.'),
    });
  }

  save(): void {
    const invalid = this.invalidReason();
    this.message.set('');
    if (invalid) {
      this.error.set(invalid);
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.admin.updatePricingConfig({ config: this.configPayload() }).subscribe({
      next: (res) => {
        this.form.patchValue({
          dieselPricePerLitreEur: res.config.dieselPricePerLitreEur,
          driverHourlyTargetEur: res.config.driverHourlyTargetEur,
        });
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

  private configPayload(): { dieselPricePerLitreEur: number; driverHourlyTargetEur: number } {
    const raw = this.form.getRawValue();
    return {
      dieselPricePerLitreEur: Number(raw.dieselPricePerLitreEur),
      driverHourlyTargetEur: Number(raw.driverHourlyTargetEur),
    };
  }

  private invalidReason(): string | null {
    const raw = this.form.getRawValue();
    const values = [raw.dieselPricePerLitreEur, raw.driverHourlyTargetEur];
    if (values.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      return 'Every value must be a number of zero or more.';
    }
    return null;
  }
}
