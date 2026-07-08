import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GoogleMap, MapDirectionsRenderer, MapMarker, MapDirectionsService } from '@angular/google-maps';
import { Store } from '@ngrx/store';
import { EMPTY, Observable, Subscription } from 'rxjs';
import { catchError, map, throttleTime } from 'rxjs/operators';
import { LoggerService } from '../../../core/services/logger.service';
import { SocketService } from '../../../core/services/socket.service';
import { isDriverMapTrackingStatus } from '../../../shared/utils/order-tracking';
import * as DriverActions from '../state/driver.actions';
import { selectDriverMyLoading, selectDriverMyOrders } from '../state/driver.selectors';
const LOCATION_THROTTLE_MS = 8000;
const GEO_DENIED_MESSAGE = 'Tracking disabled - delivery might be delayed';
const CYPRUS_CENTER = { lat: 35.1264, lng: 33.4299 };

function geolocationWatchPosition$(
  watchIdRef: { current: number | null },
  options?: PositionOptions,
): Observable<GeolocationPosition> {
  return new Observable<GeolocationPosition>((subscriber) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      subscriber.error(new Error('Geolocation not supported'));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (position) => subscriber.next(position),
      (err) => subscriber.error(err),
      { enableHighAccuracy: true, maximumAge: 5000, ...options },
    );
    watchIdRef.current = id;
    return () => {
      navigator.geolocation.clearWatch(id);
      watchIdRef.current = null;
    };
  });
}

@Component({
  selector: 'app-driver-active-delivery',
  standalone: true,
  imports: [RouterLink, DecimalPipe, GoogleMap, MapDirectionsRenderer, MapMarker],
  templateUrl: './driver-active-delivery.component.html',
  styleUrl: './driver-active-delivery.component.css',
})
export class DriverActiveDeliveryComponent implements OnDestroy {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly socket = inject(SocketService);
  private readonly logger = inject(LoggerService);
  private readonly directionsService = inject(MapDirectionsService);

  readonly trackingPermissionMessage = signal<string | null>(null);

  private geoSubscription: Subscription | null = null;
  private readonly geolocationWatchId = { current: null as number | null };
  private mapInstance: google.maps.Map | null = null;

  readonly directionsResult = signal<google.maps.DirectionsResult | null>(null);

  readonly directionsRendererOptions: google.maps.DirectionsRendererOptions = {
    suppressMarkers: true,
    preserveViewport: true,
    polylineOptions: {
      strokeColor: '#22C55E',
      strokeOpacity: 0.92,
      strokeWeight: 5,
    },
  };

  readonly mapOptions: google.maps.MapOptions = {
    mapTypeControl: true,
    zoomControl: true,
    scrollwheel: true,
  };

  readonly myOrders = toSignal(this.store.select(selectDriverMyOrders), { initialValue: [] });
  readonly loading = toSignal(this.store.select(selectDriverMyLoading), { initialValue: true });

  readonly orderIdParam = toSignal(this.route.paramMap.pipe(map((p) => p.get('orderId') ?? '')), {
    initialValue: '',
  });

  readonly order = computed(() => {
    const id = this.orderIdParam();
    if (!id) return null;
    return this.myOrders().find((o) => String(o._id) === id) ?? null;
  });

  readonly center = computed(() => {
    const o = this.order();
    if (!o?.pickupLocation?.lat || !o?.dropoffLocation?.lat) return CYPRUS_CENTER;
    return {
      lat: (o.pickupLocation.lat + o.dropoffLocation.lat) / 2,
      lng: (o.pickupLocation.lng + o.dropoffLocation.lng) / 2,
    };
  });

  readonly zoom = 11;

  readonly pickupPosition = computed(() => {
    const o = this.order();
    return o?.pickupLocation ? { lat: o.pickupLocation.lat, lng: o.pickupLocation.lng } : null;
  });

  readonly dropoffPosition = computed(() => {
    const o = this.order();
    return o?.dropoffLocation ? { lat: o.dropoffLocation.lat, lng: o.dropoffLocation.lng } : null;
  });

  readonly canTrack = computed(() => {
    const o = this.order();
    return !!o && isDriverMapTrackingStatus(o.status);
  });

  constructor() {
    this.store.dispatch(DriverActions.loadDriverMyOrders({}));
    this.socket.connect();

    effect((onCleanup) => {
      const o = this.order();
      if (!o?.pickupLocation?.address || !o?.dropoffLocation?.address) {
        this.directionsResult.set(null);
        return;
      }
      const sub = this.directionsService
        .route({
          origin: o.pickupLocation.address,
          destination: o.dropoffLocation.address,
          travelMode: google.maps.TravelMode.DRIVING,
        })
        .subscribe({
          next: ({ result, status }) => {
            if (status !== google.maps.DirectionsStatus.OK || !result) {
              this.directionsResult.set(null);
              return;
            }
            this.directionsResult.set(result);
          },
          error: () => this.directionsResult.set(null),
        });
      onCleanup(() => sub.unsubscribe());
    });

    effect(() => {
      const dirs = this.directionsResult();
      const map = this.mapInstance;
      if (!dirs || !map) return;
      window.setTimeout(() => {
        google.maps.event.trigger(map, 'resize');
        const bounds = dirs.routes?.[0]?.bounds;
        if (bounds) map.fitBounds(bounds, 48);
      }, 160);
      window.setTimeout(() => google.maps.event.trigger(map, 'resize'), 320);
    });

    effect((onCleanup) => {
      if (this.loading()) return;
      const o = this.order();
      if (!o || !isDriverMapTrackingStatus(o.status)) {
        this.trackingPermissionMessage.set(null);
        return;
      }

      const oid = String(o._id);
      this.trackingPermissionMessage.set(null);

      this.geoSubscription = geolocationWatchPosition$(this.geolocationWatchId)
        .pipe(
          throttleTime(LOCATION_THROTTLE_MS, undefined, { leading: true, trailing: true }),
          catchError((err) => {
            this.logger.warn('[DriverActiveDelivery] Geolocation error:', err);
            this.trackingPermissionMessage.set(GEO_DENIED_MESSAGE);
            return EMPTY;
          }),
        )
        .subscribe({
          next: (pos) => {
            const cur = this.order();
            if (!cur || !isDriverMapTrackingStatus(cur.status) || String(cur._id) !== oid) {
              return;
            }
            const heading =
              typeof pos.coords.heading === 'number' && Number.isFinite(pos.coords.heading)
                ? pos.coords.heading
                : null;
            this.socket.emitDriverLocation({
              orderId: oid,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              heading,
            });
          },
        });

      onCleanup(() => {
        this.teardownGeo();
      });
    });
  }

  ngOnDestroy(): void {
    this.teardownGeo();
    this.mapInstance = null;
  }

  private teardownGeo(): void {
    if (this.geoSubscription) {
      this.geoSubscription.unsubscribe();
      this.geoSubscription = null;
    }
    if (this.geolocationWatchId.current !== null) {
      navigator.geolocation.clearWatch(this.geolocationWatchId.current);
      this.geolocationWatchId.current = null;
    }
  }

  onMapReady(map: google.maps.Map): void {
    this.mapInstance = map;
    const trigger = (): void => {
      google.maps.event.trigger(map, 'resize');
      const dirs = this.directionsResult();
      const b = dirs?.routes?.[0]?.bounds;
      if (b) map.fitBounds(b, 48);
    };
    trigger();
    requestAnimationFrame(trigger);
    setTimeout(trigger, 300);
  }
}
