import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { HttpToastControl } from '../http/http-error-context';
import { httpOptionsSkipGlobalErrorToast } from '../http/http-error-context';

const API_URL = '/api/reviews';

/** Matches React `ReviewModal` → POST /api/reviews (creates Review + driver stats). */
export interface CreateReviewPayload {
  orderId: string;
  rating: number;
  comment: string;
}

@Injectable({ providedIn: 'root' })
export class ReviewsService {
  constructor(private readonly http: HttpClient) {}

  createReview(payload: CreateReviewPayload, opts?: HttpToastControl): Observable<unknown> {
    const h = opts?.skipGlobalErrorToast ? httpOptionsSkipGlobalErrorToast() : {};
    return this.http.post(API_URL, payload, h);
  }
}
