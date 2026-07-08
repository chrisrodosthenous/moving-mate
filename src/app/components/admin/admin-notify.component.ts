import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminPushDeepLinkTesterComponent } from '../../features/admin/admin-push-deep-link-tester.component';
import { notifyPanelEnter } from '../../features/admin/admin-animations';
import { UiButtonComponent } from '@/components/ui/button';
import { UiCardComponent } from '@/components/ui/card';

@Component({
  selector: 'app-admin-notify',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FormsModule,
    AdminPushDeepLinkTesterComponent,
    UiButtonComponent,
    UiCardComponent,
  ],
  templateUrl: './admin-notify.component.html',
  styleUrl: './admin-panels.css',
  animations: [notifyPanelEnter],
})
export class AdminNotifyComponent {
  readonly userEmail = input<string>('');
  readonly notifyTab = input.required<'push' | 'email'>();
  readonly emailScenarios = input.required<
    ReadonlyArray<{ id: string; label: string; trigger: string }>
  >();
  readonly selectedEmailScenario = input.required<string>();
  readonly emailScenarioSending = input(false);
  readonly emailScenarioResult = input('');

  readonly notifyTabChange = output<'push' | 'email'>();
  readonly selectedEmailScenarioChange = output<string>();
  readonly sendScenarioEmail = output<void>();
  readonly pushTesterToast = output<{ message: string; variant: 'success' | 'error' }>();
}
