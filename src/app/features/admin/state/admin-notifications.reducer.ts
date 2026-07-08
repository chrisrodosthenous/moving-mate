import { createReducer, on } from '@ngrx/store';
import type {
  NotificationSettingsBlock,
  NotificationSettingRow,
} from '../../../core/services/admin-notification-settings.service';
import * as AdminNotificationsActions from './admin-notifications.actions';

export const adminNotificationsFeatureKey = 'adminNotifications';

export interface AdminNotificationsState {
  emailBlock: NotificationSettingsBlock;
  pushBlock: NotificationSettingsBlock;
  loading: boolean;
  error: string | null;
  savingId: string | null;
  sendingTestId: string | null;
  testEmails: Record<string, string>;
  toast: { message: string; variant: 'success' | 'error' } | null;
}

const emptyBlock = (): NotificationSettingsBlock => ({ serviceHealthy: false, items: [] });

export const initialAdminNotificationsState: AdminNotificationsState = {
  emailBlock: emptyBlock(),
  pushBlock: emptyBlock(),
  loading: false,
  error: null,
  savingId: null,
  sendingTestId: null,
  testEmails: {},
  toast: null,
};

function patchBlockItems(block: NotificationSettingsBlock, setting: NotificationSettingRow): NotificationSettingsBlock {
  return {
    ...block,
    items: block.items.map((i) => (i._id === setting._id ? { ...i, ...setting } : i)),
  };
}

export const adminNotificationsReducer = createReducer(
  initialAdminNotificationsState,
  on(AdminNotificationsActions.loadAdminNotificationSettings, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(AdminNotificationsActions.loadAdminNotificationSettingsSuccess, (state, { email, push }) => ({
    ...state,
    loading: false,
    error: null,
    emailBlock: email,
    pushBlock: push,
  })),
  on(AdminNotificationsActions.loadAdminNotificationSettingsFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(AdminNotificationsActions.patchAdminNotificationSetting, (state, { id }) => ({
    ...state,
    savingId: id,
  })),
  on(AdminNotificationsActions.patchAdminNotificationSettingSuccess, (state, { setting }) => ({
    ...state,
    savingId: null,
    emailBlock: patchBlockItems(state.emailBlock, setting),
    pushBlock: patchBlockItems(state.pushBlock, setting),
    toast: { message: 'Settings updated', variant: 'success' },
  })),
  on(AdminNotificationsActions.patchAdminNotificationSettingFailure, (state, { error }) => ({
    ...state,
    savingId: null,
    toast: { message: error, variant: 'error' },
  })),
  on(AdminNotificationsActions.sendAdminNotificationEmailTest, (state, { eventId }) => ({
    ...state,
    sendingTestId: eventId,
  })),
  on(AdminNotificationsActions.sendAdminNotificationEmailTestSuccess, (state, { message }) => ({
    ...state,
    sendingTestId: null,
    toast: { message, variant: 'success' },
  })),
  on(AdminNotificationsActions.sendAdminNotificationEmailTestFailure, (state, { error }) => ({
    ...state,
    sendingTestId: null,
    toast: { message: error, variant: 'error' },
  })),
  on(AdminNotificationsActions.setAdminNotificationTestEmail, (state, { eventId, value }) => ({
    ...state,
    testEmails: { ...state.testEmails, [eventId]: value },
  })),
  on(AdminNotificationsActions.clearAdminNotificationTestEmail, (state, { eventId }) => {
    const next = { ...state.testEmails };
    delete next[eventId];
    return { ...state, testEmails: next };
  }),
  on(AdminNotificationsActions.dismissAdminNotificationToast, (state) => ({
    ...state,
    toast: null,
  })),
  on(AdminNotificationsActions.showAdminNotificationToast, (state, { message, variant }) => ({
    ...state,
    toast: { message, variant },
  })),
);
