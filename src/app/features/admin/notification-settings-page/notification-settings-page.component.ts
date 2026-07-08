import { AsyncPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { Store } from '@ngrx/store';
import { LucideAngularModule } from 'lucide-angular';
import { EMPTY, filter, switchMap, timer } from 'rxjs';
import { FcmService } from '../../../core/services/fcm.service';
import type { NotificationSettingRow } from '../../../core/services/admin-notification-settings.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { leafShellOutletData } from '../../../shared/routing/shell-route.helper';
import { notificationSettingsSections } from '../admin-animations';
import * as AdminNotificationsActions from '../state/admin-notifications.actions';
import {
  selectAdminNotificationsPageView,
  selectAdminNotificationsToast,
} from '../state/admin-notifications.selectors';

@Component({
  selector: 'app-notification-settings-page',
  standalone: true,
  imports: [AsyncPipe, RouterLink, LucideAngularModule, EmptyStateComponent, SidebarComponent],
  animations: [notificationSettingsSections],
  templateUrl: './notification-settings-page.component.html',
  styleUrl: './notification-settings-page.component.css',
})
export class NotificationSettingsPageComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly fcm = inject(FcmService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly vm$ = this.store.select(selectAdminNotificationsPageView);

  readonly shellOutletTick = signal(0);

  readonly pageHeading = computed(() => {
    void this.shellOutletTick();
    return leafShellOutletData(this.router).pageTitle || 'Notification settings';
  });

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.shellOutletTick.update((k) => k + 1));
  }

  ngOnInit(): void {
    this.store.dispatch(AdminNotificationsActions.loadAdminNotificationSettings());
    void this.fcm.registerToken().catch(() => {});
    void this.fcm.syncStoredTokenToBackend();

    this.store
      .select(selectAdminNotificationsToast)
      .pipe(
        switchMap((toast) => (toast ? timer(3600) : EMPTY)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.store.dispatch(AdminNotificationsActions.dismissAdminNotificationToast()));
  }

  refresh(): void {
    this.store.dispatch(AdminNotificationsActions.loadAdminNotificationSettings());
  }

  onToggle(row: NotificationSettingRow): void {
    this.store.dispatch(
      AdminNotificationsActions.patchAdminNotificationSetting({
        id: String(row._id),
        isEnabled: !row.isEnabled,
      }),
    );
  }

  onTestEmailChange(eventId: string, value: string): void {
    this.store.dispatch(AdminNotificationsActions.setAdminNotificationTestEmail({ eventId, value }));
  }

  onClearTestRow(eventId: string): void {
    this.store.dispatch(AdminNotificationsActions.clearAdminNotificationTestEmail({ eventId }));
  }

  onSendEmailTest(row: NotificationSettingRow, testEmails: Record<string, string>): void {
    const eventId = String(row._id);
    const raw = (testEmails[eventId] ?? '').trim();
    const email = raw || 'test@example.com';
    this.store.dispatch(
      AdminNotificationsActions.sendAdminNotificationEmailTest({
        eventId,
        email,
        template: row.eventName,
      }),
    );
  }
}
