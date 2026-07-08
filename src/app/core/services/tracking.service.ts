import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SocketService } from './socket.service';

export interface DriverTrackingPoint {
  lat: number;
  lng: number;
  heading?: number;
}

@Injectable({ providedIn: 'root' })
export class TrackingService {
  private readonly socket = inject(SocketService);

  /**
   * Joins Socket.io tracking for `orderId` and emits normalized driver coordinates until unsubscribed,
   * then leaves the room. Pair with REST-seeded coords in {@link TrackingComponent}.
   */
  getDriverLocation(orderId: string): Observable<DriverTrackingPoint> {
    const id = String(orderId ?? '').trim();
    return new Observable<DriverTrackingPoint>((subscriber) => {
      if (!id) {
        subscriber.complete();
        return;
      }
      this.socket.connect();
      this.socket.emitJoinOrderTracking(id);

      const off = this.socket.onCustomerLocationUpdate((p) => {
        const lat = Number(p?.lat);
        const lng = Number(p?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const out: DriverTrackingPoint = { lat, lng };
        const h = Number(p?.heading);
        if (Number.isFinite(h) && h >= 0 && h <= 360) {
          out.heading = h;
        }
        subscriber.next(out);
      });

      return () => {
        off();
        this.socket.emitLeaveOrderTracking(id);
      };
    });
  }
}
