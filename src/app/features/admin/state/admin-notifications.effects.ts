import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, mergeMap, of } from 'rxjs';
import { AdminNotificationSettingsService } from '../../../core/services/admin-notification-settings.service';
import { extractHttpErrorMessage } from '../../../core/utils/http-error';
import * as AdminNotificationsActions from './admin-notifications.actions';

@Injectable()
export class AdminNotificationsEffects {
  private readonly actions$ = inject(Actions);
  private readonly api = inject(AdminNotificationSettingsService);

  load$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminNotificationsActions.loadAdminNotificationSettings),
      mergeMap(() =>
        this.api.getSettings({ skipGlobalErrorToast: true }).pipe(
          map((data) =>
            AdminNotificationsActions.loadAdminNotificationSettingsSuccess({
              email: data.email ?? { serviceHealthy: false, items: [] },
              push: data.push ?? { serviceHealthy: false, items: [] },
            }),
          ),
          catchError((e) =>
            of(
              AdminNotificationsActions.loadAdminNotificationSettingsFailure({
                error: extractHttpErrorMessage(e, 'Failed to load settings'),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  patch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminNotificationsActions.patchAdminNotificationSetting),
      mergeMap(({ id, isEnabled }) =>
        this.api.patchSetting(id, { isEnabled }, { skipGlobalErrorToast: true }).pipe(
          map((res) =>
            AdminNotificationsActions.patchAdminNotificationSettingSuccess({ setting: res.setting }),
          ),
          catchError((e) =>
            of(
              AdminNotificationsActions.patchAdminNotificationSettingFailure({
                error: extractHttpErrorMessage(e, 'Update failed'),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  emailTest$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminNotificationsActions.sendAdminNotificationEmailTest),
      mergeMap(({ eventId, email, template }) =>
        this.api
          .postNotificationTest(
            {
              type: 'email',
              eventId,
              email,
              template,
            },
            { skipGlobalErrorToast: true },
          )
          .pipe(
            map(() =>
              AdminNotificationsActions.sendAdminNotificationEmailTestSuccess({
                message: `Test email sent to ${email}`,
              }),
            ),
            catchError((e) =>
              of(
                AdminNotificationsActions.sendAdminNotificationEmailTestFailure({
                  error: extractHttpErrorMessage(e, 'Failed to send test email'),
                }),
              ),
            ),
          ),
      ),
    ),
  );
}
