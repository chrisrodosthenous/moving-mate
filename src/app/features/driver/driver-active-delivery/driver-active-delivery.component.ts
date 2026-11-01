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
import { buildDriverCarGoogleIcon } from '../../../shared/utils/driver-map-car-icon';
import { routeEndpointMarkerOptions, routeLineRendererOptions } from '../../../shared/utils/route-map-markers';
import * as DriverActions from '../state/driver.actions';
import {
  selectDriverMyLoading,
  selectDriverMyOrders,
  selectDriverTripBusyId,
  selectDriverTripStatusError,
} from '../state/driver.selectors';
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
  readonly driverPosition = signal<{ lat: number; lng: number } | null>(null);
  readonly driverHeading = signal<number | null>(null);
  readonly driverCarIcon = signal<google.maps.Icon | null>(null);
  private fittedDriver = false;

  readonly driverMarkerOptions = computed((): google.maps.MarkerOptions => {
    const icon = this.driverCarIcon();
    const heading = this.driverHeading();
    return {
      title: 'Your position',
      optimized: false,
      zIndex: 1000,
      ...(icon ? { icon } : {}),
      ...(heading != null ? { rotation: heading } : {}),
    };
  });

  readonly directionsRendererOptions = routeLineRendererOptions({
    preserveViewport: true,
    polylineOptions: {
      strokeColor: '#22C55E',
      strokeOpacity: 0.92,
      strokeWeight: 5,
    },
  });
  readonly pickupMarkerOptions = routeEndpointMarkerOptions('pickup');
  readonly dropoffMarkerOptions = routeEndpointMarkerOptions('dropoff');

  readonly mapOptions: google.maps.MapOptions = {
    mapTypeControl: true,
    zoomControl: true,
    scrollwheel: true,
  };

  readonly myOrders = toSignal(this.store.select(selectDriverMyOrders), { initialValue: [] });
  readonly loading = toSignal(this.store.select(selectDriverMyLoading), { initialValue: true });
  readonly tripBusyId = toSignal(this.store.select(selectDriverTripBusyId), { initialValue: null });
  readonly tripStatusError = toSignal(this.store.select(selectDriverTripStatusError), { initialValue: null });

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

  readonly canMarkPickedUp = computed(() => this.order()?.status === 'accepted');

  readonly canMarkDelivered = computed(() => {
    const status = this.order()?.status;
    return status === 'driver_is_on_the_way' || status === 'picked_up' || status === 'in_progress';
  });

  tripBusy(): boolean {
    const id = this.order()?._id;
    return !!id && this.tripBusyId() === String(id);
  }

  markPickedUp(): void {
    const id = this.order()?._id;
    if (!id) return;
    this.store.dispatch(DriverActions.updateDriverTripStatus({ id: String(id), status: 'in-transit' }));
  }

  markDelivered(): void {
    const id = this.order()?._id;
    if (!id) return;
    this.store.dispatch(DriverActions.updateDriverTripStatus({ id: String(id), status: 'completed' }));
  }

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
        this.fitMap(true);
      }, 160);
      window.setTimeout(() => google.maps.event.trigger(map, 'resize'), 320);
    });

    effect((onCleanup) => {
      if (this.loading()) return;
      const o = this.order();
      if (!o || !isDriverMapTrackingStatus(o.status)) {
        this.trackingPermissionMessage.set(null);
        this.driverPosition.set(null);
        this.driverHeading.set(null);
        this.fittedDriver = false;
        return;
      }

      const oid = String(o._id);
      this.trackingPermissionMessage.set(null);
      this.fittedDriver = false;
      const saved = o.driverLocation;
      if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) {
        this.driverPosition.set({ lat: saved.lat, lng: saved.lng });
        if (typeof saved.heading === 'number' && Number.isFinite(saved.heading)) {
          this.driverHeading.set(saved.heading);
        }
        this.fitMap(true);
      }

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
            this.driverPosition.set({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            if (heading != null) this.driverHeading.set(heading);
            this.fitMap(false);
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
    this.ensureDriverCarIcon();
    const trigger = (): void => {
      google.maps.event.trigger(map, 'resize');
      this.fitMap(true);
    };
    trigger();
    requestAnimationFrame(trigger);
    setTimeout(trigger, 300);
  }

  private ensureDriverCarIcon(): void {
    if (this.driverCarIcon()) return;
    if (typeof google === 'undefined' || !google.maps?.Size) return;
    try {
      this.driverCarIcon.set(buildDriverCarGoogleIcon());
    } catch {
      /* Marker still shows as a default pin until the icon can be built. */
    }
  }

  /** Fit the road, and the car the first time it appears, so the icon stays on screen. */
  private fitMap(force: boolean): void {
    const map = this.mapInstance;
    if (!map || typeof google === 'undefined') return;
    const driver = this.driverPosition();
    if (!force && (!driver || this.fittedDriver)) return;
    const bounds = new google.maps.LatLngBounds();
    const routeBounds = this.directionsResult()?.routes?.[0]?.bounds;
    if (routeBounds) bounds.union(routeBounds);
    const pickup = this.pickupPosition();
    const dropoff = this.dropoffPosition();
    if (pickup) bounds.extend(pickup);
    if (dropoff) bounds.extend(dropoff);
    if (driver) bounds.extend(driver);
    if (bounds.isEmpty()) return;
    map.fitBounds(bounds, 48);
    if (driver) this.fittedDriver = true;
  }
}
