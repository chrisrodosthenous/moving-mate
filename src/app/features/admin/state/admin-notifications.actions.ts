import { createAction, props } from '@ngrx/store';
import type {
  NotificationSettingsBlock,
  NotificationSettingRow,
} from '../../../core/services/admin-notification-settings.service';

export const loadAdminNotificationSettings = createAction('[Admin Notifications] Load');

export const loadAdminNotificationSettingsSuccess = createAction(
  '[Admin Notifications] Load Success',
  props<{ email: NotificationSettingsBlock; push: NotificationSettingsBlock }>(),
);

export const loadAdminNotificationSettingsFailure = createAction(
  '[Admin Notifications] Load Failure',
  props<{ error: string }>(),
);

export const patchAdminNotificationSetting = createAction(
  '[Admin Notifications] Patch Setting',
  props<{ id: string; isEnabled: boolean }>(),
);

export const patchAdminNotificationSettingSuccess = createAction(
  '[Admin Notifications] Patch Success',
  props<{ setting: NotificationSettingRow }>(),
);

export const patchAdminNotificationSettingFailure = createAction(
  '[Admin Notifications] Patch Failure',
  props<{ error: string }>(),
);

export const sendAdminNotificationEmailTest = createAction(
  '[Admin Notifications] Send Email Test',
  props<{ eventId: string; email: string; template: string }>(),
);

export const sendAdminNotificationEmailTestSuccess = createAction(
  '[Admin Notifications] Send Email Test Success',
  props<{ message: string }>(),
);

export const sendAdminNotificationEmailTestFailure = createAction(
  '[Admin Notifications] Send Email Test Failure',
  props<{ error: string }>(),
);

export const setAdminNotificationTestEmail = createAction(
  '[Admin Notifications] Set Test Email Field',
  props<{ eventId: string; value: string }>(),
);

export const clearAdminNotificationTestEmail = createAction(
  '[Admin Notifications] Clear Test Email Field',
  props<{ eventId: string }>(),
);

export const dismissAdminNotificationToast = createAction('[Admin Notifications] Dismiss Toast');

export const showAdminNotificationToast = createAction(
  '[Admin Notifications] Show Toast',
  props<{ message: string; variant: 'success' | 'error' }>(),
);
