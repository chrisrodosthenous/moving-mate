import { createFeatureSelector, createSelector } from '@ngrx/store';
import {
  adminNotificationsFeatureKey,
  type AdminNotificationsState,
} from './admin-notifications.reducer';

export const selectAdminNotificationsState =
  createFeatureSelector<AdminNotificationsState>(adminNotificationsFeatureKey);

export const selectAdminNotificationEmailBlock = createSelector(
  selectAdminNotificationsState,
  (s) => s.emailBlock,
);

export const selectAdminNotificationPushBlock = createSelector(
  selectAdminNotificationsState,
  (s) => s.pushBlock,
);

export const selectAdminNotificationsLoading = createSelector(
  selectAdminNotificationsState,
  (s) => s.loading,
);

export const selectAdminNotificationsError = createSelector(
  selectAdminNotificationsState,
  (s) => s.error,
);

export const selectAdminNotificationsSavingId = createSelector(
  selectAdminNotificationsState,
  (s) => s.savingId,
);

export const selectAdminNotificationsSendingTestId = createSelector(
  selectAdminNotificationsState,
  (s) => s.sendingTestId,
);

export const selectAdminNotificationTestEmails = createSelector(
  selectAdminNotificationsState,
  (s) => s.testEmails,
);

export const selectAdminNotificationsToast = createSelector(
  selectAdminNotificationsState,
  (s) => s.toast,
);

export const selectAdminNotificationsPageView = createSelector(
  selectAdminNotificationEmailBlock,
  selectAdminNotificationPushBlock,
  selectAdminNotificationsLoading,
  selectAdminNotificationsError,
  selectAdminNotificationsSavingId,
  selectAdminNotificationsSendingTestId,
  selectAdminNotificationTestEmails,
  selectAdminNotificationsToast,
  (emailBlock, pushBlock, loading, error, savingId, sendingTestId, testEmails, toast) => ({
    emailBlock,
    pushBlock,
    loading,
    error,
    savingId,
    sendingTestId,
    testEmails,
    toast,
  }),
);
