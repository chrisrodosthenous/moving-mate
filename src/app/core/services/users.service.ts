import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API_URL = '/api/users';

export interface DriverRatingResponse {
  averageRating: number | null;
  totalRatings: number;
  reviewCount?: number;
  totalReviews?: number;
}

export interface DriverAnalyticsPayload {
  weeklyEarnings: { labels: string[]; euros: number[] };
  tripStats: { completed: number; cancelled: number; declined: number };
  rating: { average: number | null; max: number; priorityThreshold: number };
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private http: HttpClient) {}

  getDriverRating(): Observable<DriverRatingResponse> {
    return this.http.get<DriverRatingResponse>(`${API_URL}/driver-rating`);
  }

  getDriverAnalytics(): Observable<DriverAnalyticsPayload> {
    return this.http.get<DriverAnalyticsPayload>(`${API_URL}/driver-analytics`);
  }
}
