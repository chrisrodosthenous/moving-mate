import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { httpOptionsSkipGlobalErrorToast } from '../../../../core/http/http-error-context';

export interface ContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface ContactResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ContactService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = '/api/contact';

  send(payload: ContactPayload): Observable<ContactResponse> {
    // Skip the global error toast — the contact form shows its own inline feedback.
    return this.http.post<ContactResponse>(this.endpoint, payload, httpOptionsSkipGlobalErrorToast());
  }
}
