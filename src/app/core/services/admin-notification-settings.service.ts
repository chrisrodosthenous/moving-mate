import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { HttpToastControl } from '../http/http-error-context';
import { httpOptionsSkipGlobalErrorToast } from '../http/http-error-context';

export interface NotificationSettingRow {
  _id: string;
  type: 'email' | 'push';
  eventName: string;
  label?: string;
  description: string;
  isEnabled: boolean;
}

export interface NotificationSettingsBlock {
  serviceHealthy: boolean;
  items: NotificationSettingRow[];
}

export interface NotificationSettingsResponse {
  email: NotificationSettingsBlock;
  push: NotificationSettingsBlock;
}

@Injectable({ providedIn: 'root' })
export class AdminNotificationSettingsService {
  private readonly http = inject(HttpClient);

  getSettings(opts?: HttpToastControl): Observable<NotificationSettingsResponse> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http.get<NotificationSettingsResponse>('/api/admin/notification-settings', h);
  }

  patchSetting(
    id: string,
    body: { isEnabled: boolean },
    opts?: HttpToastControl,
  ): Observable<{ success: boolean; setting: NotificationSettingRow }> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http.patch<{ success: boolean; setting: NotificationSettingRow }>(
      `/api/admin/notification-settings/${id}`,
      body,
      h,
    );
  }

  postNotificationTest(
    body: {
      type: 'email' | 'push';
      eventId: string;
      email?: string;
      template?: string;
      url?: string;
    },
    opts?: HttpToastControl,
  ): Observable<{ success?: boolean; message?: string }> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http.post<{ success?: boolean; message?: string }>('/api/admin/notifications/test', body, h);
  }
}
