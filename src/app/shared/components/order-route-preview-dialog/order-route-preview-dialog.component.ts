import {
  Component,
  computed,
  effect,
  HostBinding,
  inject,
  input,
  output,
  signal,
  untracked,
  ViewChild,
} from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Observable, Subscription } from 'rxjs';
import { map, throttleTime } from 'rxjs/operators';
import { GoogleMap, MapDirectionsRenderer, MapMarker, MapDirectionsService } from '@angular/google-maps';

import type { TransportOrder } from '../../../core/services/orders.service';
import { GoogleMapsLoaderService } from '../../../core/services/google-maps-loader.service';
import { LoggerService } from '../../../core/services/logger.service';
import { SocketService } from '../../../core/services/socket.service';
import { AuthStore } from '../../../store/auth.store';
import { UiButtonComponent } from '../../../../components/ui/button';
import { buildDriverCarGoogleIcon } from '../../utils/driver-map-car-icon';
import { isDriverMapTrackingStatus } from '../../utils/order-tracking';
import { toSignal } from '@angular/core/rxjs-interop';

const CYPRUS_CENTER = { lat: 35.1264, lng: 33.4299 };
const MD_BREAKPOINT_QUERY = '(min-width: 768px)';

function matchMediaMdUp(): boolean {
  return typeof globalThis !== 'undefined' && 'matchMedia' in globalThis
    ? globalThis.matchMedia(MD_BREAKPOINT_QUERY).matches
    : false;
}

/** Match linear interpolation pacing on `/customer/orders/:id` live map. */
const ROUTE_ANIM_MS = 750;
const MAP_FIT_PADDING = 52;
const DRIVER_SOCKET_EMIT_MS = 6500;

/** Customers: driver car + live socket only while the trip is in progress (not accepted / completed). */
export function isCustomerRouteDriverTrackingStatus(status: string | undefined): boolean {
  return isDriverMapTrackingStatus(status);
}

/** Drivers: same window for map marker + location emits on route preview. */
function isDriverRoutePreviewTrackingStatus(status: string | undefined): boolean {
  return isDriverMapTrackingStatus(status);
}

function bearingDegrees(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function geolocationWatch$(
  watchIdRef: { current: number | null },
  options?: PositionOptions,
): Observable<GeolocationPosition> {
  return new Observable((subscriber) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      subscriber.error(new Error('Geolocation not supported'));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (position) => subscriber.next(position),
      (err) => subscriber.error(err),
      { enableHighAccuracy: true, maximumAge: 3000, ...options },
    );
    watchIdRef.current = id;
    return () => {
      navigator.geolocation.clearWatch(id);
      watchIdRef.current = null;
    };
  });
}

@Component({
  selector: 'app-order-route-preview-dialog',
  standalone: true,
  imports: [GoogleMap, MapDirectionsRenderer, MapMarker, UiButtonComponent],
  templateUrl: './order-route-preview-dialog.component.html',
})
export class OrderRoutePreviewDialogComponent {
  private readonly mapsLoader = inject(GoogleMapsLoaderService);
  private readonly directionsService = inject(MapDirectionsService);
  private readonly logger = inject(LoggerService);
  private readonly auth = inject(AuthStore);
  private readonly socket = inject(SocketService);
  private readonly breakpointObserver = inject(BreakpointObserver);

  /** Tailwind `md` — aligns embed split layout with parent's `md:flex`. */
  private readonly viewportMdUp = toSignal(
    this.breakpointObserver.observe(MD_BREAKPOINT_QUERY).pipe(map((r) => r.matches)),
    { initialValue: matchMediaMdUp() },
  );

  /** When true, renders only map + address panel (parent supplies drawer shell, backdrop, title). */
  readonly embedMode = input(false);

  @HostBinding('class')
  get routePreviewHostClass(): string {
    return this.embedMode() ? 'block h-full min-h-0 w-full' : '';
  }

  readonly order = input<TransportOrder | null | undefined>(undefined);
  readonly closed = output<void>();

  @ViewChild(GoogleMap) private mapComp?: GoogleMap;

  readonly mapsEmbedReady = signal(false);

  readonly directionsResult = signal<google.maps.DirectionsResult | null>(null);
  private directionsSub: Subscription | null = null;

  /** A→B coords only — stable across store polls that swap the `order()` object reference. */
  private readonly directionsRouteKey = computed(() => {
    const o = this.order();
    if (!o?.pickupLocation?.lat || !o?.dropoffLocation?.lat) return '';
    const p = o.pickupLocation;
    const d = o.dropoffLocation;
    return `${String(o._id)}|${p.lat},${p.lng}|${d.lat},${d.lng}`;
  });

  /**
   * Live tracking restart only when id/status/role change — not on every merged list refresh
   * (prevents geolocation/socket teardown + map refit storms).
   */
  private readonly routeTrackingScopeKey = computed(() => {
    const o = this.order();
    if (!o) return '';
    const id = String(o._id);
    const st = (o.status ?? '').toLowerCase();
    const role = this.auth.isDriver() ? 'd' : this.auth.isCustomer() ? 'c' : 'a';
    return `${id}|${st}|${role}`;
  });

  /**
   * Map inputs must keep referential / update stability: `mapBaselineCenter` as plain computed
   * produced a new object every time `order()` was a fresh reference → `setCenter` every poll → shake.
   */
  readonly mapStableCenterSig = signal<google.maps.LatLngLiteral>(CYPRUS_CENTER);
  readonly embedPickupLatLngSig = signal<google.maps.LatLngLiteral | null>(null);
  readonly embedDropoffLatLngSig = signal<google.maps.LatLngLiteral | null>(null);

  readonly driverCarIcon = signal<google.maps.Icon | null>(null);

  readonly driverMarkerPosition = signal<{ lat: number; lng: number } | null>(null);
  readonly driverHeadingDeg = signal<number | null>(null);
  readonly geoUnavailableMessage = signal<string | null>(null);

  private segFrom: { lat: number; lng: number } | null = null;
  private segTo: { lat: number; lng: number } | null = null;
  private segStartMs = 0;
  private animRafId: number | null = null;
  private fitRafId: number | null = null;
  private lastEmit: { lat: number; lng: number } | null = null;
  private lastFitAt = 0;
  private socketUnsub: (() => void) | null = null;
  private joinedOrderId: string | null = null;
  private geoSub: Subscription | null = null;
  private readonly geoWatchId = { current: null as number | null };

  /** Avoid re-applying identical DB pings when merged order updates repeatedly. */
  private lastHydratedDriverDbKey = '';

  readonly directionsRendererOptions: google.maps.DirectionsRendererOptions = {
    suppressMarkers: false,
    /** Manual `applyThreePointBounds` + optional driver follow; renderer must not also auto-fit. */
    preserveViewport: true,
    polylineOptions: {
      strokeColor: '#22C55E',
      strokeOpacity: 0.92,
      strokeWeight: 5,
    },
  };

  readonly mapBaselineZoom = 11;

  /**
   * Desktop split (<768px hides embed in parents — see mobile fullscreen dialog): cooperate with vertical page scroll.
   * Modal / small viewports / touch-first: greedy so pinch and scroll zoom behave normally on phones and tablets.
   */
  readonly mapDisplayOptions = computed((): google.maps.MapOptions => {
    const splitEmbeddedColumn = this.embedMode() && this.viewportMdUp();
    return {
      mapTypeControl: true,
      zoomControl: true,
      streetViewControl: false,
      ...(splitEmbeddedColumn
        ? { scrollwheel: false, gestureHandling: 'cooperative' as const }
        : { scrollwheel: true, gestureHandling: 'greedy' as const }),
    };
  });

  readonly showDriverMarker = computed(() => {
    const o = this.order();
    /** Position + status only; car icon is optional (loads async — do not hide marker until icon exists). */
    if (!o || this.driverMarkerPosition() === null) return false;
    if (this.auth.isCustomer()) return isCustomerRouteDriverTrackingStatus(o.status);
    if (this.auth.isDriver()) return isDriverRoutePreviewTrackingStatus(o.status);
    return isCustomerRouteDriverTrackingStatus(o.status);
  });

  readonly driverMarkerOptions = computed((): google.maps.MarkerOptions & { rotation?: number } => {
    const h = this.driverHeadingDeg();
    const rotation =
      h != null && Number.isFinite(h) ? ((((h % 360) + 360) % 360) as number) : 0;

    const icon = this.driverCarIcon();
    return {
      title: 'Driver current position',
      optimized: false,
      zIndex: 1000,
      ...(icon ? { icon } : {}),
      rotation,
    };
  });

  readonly simpleFallbackMarkers = computed(() => !this.directionsResult());

  readonly pickupMarkerOptions: google.maps.MarkerOptions = {
    label: { text: 'A', color: '#F0EDE6' },
    title: 'Pickup',
  };

  readonly dropoffMarkerOptions: google.maps.MarkerOptions = {
    label: { text: 'B', color: '#F0EDE6' },
    title: 'Dropoff',
  };

  /** When Mongo `driverLocation` changes (silent list reload), hydrate the interpolated marker — separate from sockets. */
  readonly driverHydrateKey = computed(() => {
    const o = this.order();
    if (!o) return '';
    const dl = o.driverLocation;
    if (!this.auth.isCustomer() || !dl?.lat || !dl?.lng || !isCustomerRouteDriverTrackingStatus(o.status))
      return '';
    return `${dl.lat},${dl.lng},${Number(dl.heading ?? NaN)}`;
  });

  /** Stable while the same order is pinned; avoids resize storms when the parent passes a fresh merged object on poll. */
  private readonly routePreviewResizeKey = computed(() => {
    const o = this.order();
    if (!o?.pickupLocation?.lat || !this.mapsEmbedReady()) return '';
    return String(o._id);
  });

  constructor() {
    effect((onCleanup) => {
      const key = this.routePreviewResizeKey();
      if (!key) return;
      const t = window.setTimeout(() => {
        this.triggerGoogleMapResize();
        untracked(() => this.scheduleFitBoundsDebounced(true));
      }, 300);
      onCleanup(() => window.clearTimeout(t));
    });

    effect(() => {
      const routeKey = this.directionsRouteKey();
      if (!routeKey) return;
      void this.mapsLoader.ensureLoaded().then((ok) => {
        untracked(() => {
          this.mapsEmbedReady.set(ok);
          if (!ok) {
            this.logger.warn('OrderRoutePreviewDialog: Google Maps embed failed to load');
          }
        });
      });
    });

    /** Icon uses `google.maps.Size` — library can surface `mapsEmbedReady` a tick before `google.maps` ctor is usable. */
    effect(() => {
      if (!this.mapsEmbedReady()) return;
      const tryBuildIcon = (): void =>
        untracked(() => {
          if (typeof google === 'undefined' || !google.maps?.Size) return;
          if (this.driverCarIcon()) return;
          try {
            this.driverCarIcon.set(buildDriverCarGoogleIcon());
          } catch {
            /* Rare race — `@if (showDriverMarker)` still renders default pin via `driverMarkerOptions`. */
          }
        });
      queueMicrotask(tryBuildIcon);
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame(() => tryBuildIcon())
        : undefined;
    });

    /** Keep map center + A/B fallback marker inputs stable when lists poll with new object references. */
    effect(() => {
      const key = this.directionsRouteKey();
      if (!key) {
        untracked(() => {
          this.mapStableCenterSig.set(CYPRUS_CENTER);
          this.embedPickupLatLngSig.set(null);
          this.embedDropoffLatLngSig.set(null);
        });
        return;
      }
      untracked(() => {
        const o = this.order();
        if (!o?.pickupLocation?.lat || !o?.dropoffLocation?.lat) return;
        const p = o.pickupLocation;
        const d = o.dropoffLocation;
        this.embedPickupLatLngSig.set({ lat: p.lat, lng: p.lng });
        this.embedDropoffLatLngSig.set({ lat: d.lat, lng: d.lng });
        this.mapStableCenterSig.set({
          lat: (p.lat + d.lat) / 2,
          lng: (p.lng + d.lng) / 2,
        });
      });
    });

    effect((onCleanup) => {
      const routeKey = this.directionsRouteKey();
      const ready = this.mapsEmbedReady();
      this.directionsSub?.unsubscribe();
      this.directionsSub = null;

      if (!ready || !routeKey) {
        this.directionsResult.set(null);
        return;
      }

      const o = untracked(() => this.order());
      if (!o?.pickupLocation?.lat || !o?.dropoffLocation?.lat) {
        this.directionsResult.set(null);
        return;
      }

      const origin = { lat: o.pickupLocation.lat, lng: o.pickupLocation.lng };
      const destination = { lat: o.dropoffLocation.lat, lng: o.dropoffLocation.lng };

      this.directionsSub = this.directionsService
        .route({
          origin,
          destination,
          travelMode: google.maps.TravelMode.DRIVING,
        })
        .subscribe({
          next: ({ result, status }) => {
            if (status !== google.maps.DirectionsStatus.OK || !result) {
              this.directionsResult.set(null);
              this.logger.warn(`OrderRoutePreviewDialog: directions failed (${String(status)})`);
              return;
            }
            this.directionsResult.set(result);
            untracked(() => this.scheduleFitBoundsDebounced(true));
          },
          error: (err: unknown) => {
            this.directionsResult.set(null);
            this.logger.warn('OrderRoutePreviewDialog: DirectionsService error:', err);
          },
        });

      onCleanup(() => {
        this.directionsSub?.unsubscribe();
        this.directionsSub = null;
      });
    });

    effect(() => {
      const raw = this.driverHydrateKey();
      if (!raw || raw === this.lastHydratedDriverDbKey) return;

      const o = untracked(() => this.order());
      if (!o?.driverLocation?.lat) return;

      const pt = {
        lat: o.driverLocation.lat,
        lng: o.driverLocation.lng,
      };
      const h = o.driverLocation.heading;
      if (typeof h === 'number' && Number.isFinite(h)) {
        untracked(() => this.driverHeadingDeg.set((((h % 360) + 360) % 360)));
      }
      untracked(() => this.enqueueDriverTarget(pt));
      this.lastHydratedDriverDbKey = raw;
      untracked(() => this.scheduleFitBoundsDebounced(false));
    });

    effect((onCleanup) => {
      const trackingKey = this.routeTrackingScopeKey();
      const ready = this.mapsEmbedReady();

      const o = untracked(() => this.order());

      if (!o || !ready || !trackingKey) {
        this.clearLiveTrackingOnly();
        this.lastHydratedDriverDbKey = '';
        this.driverMarkerPosition.set(null);
        this.driverHeadingDeg.set(null);
        this.geoUnavailableMessage.set(null);
        return;
      }

      const eligible = this.auth.isDriver()
        ? isDriverRoutePreviewTrackingStatus(o.status)
        : isCustomerRouteDriverTrackingStatus(o.status);

      if (!eligible) {
        this.clearLiveTrackingOnly();
        this.lastHydratedDriverDbKey = '';
        this.driverMarkerPosition.set(null);
        this.driverHeadingDeg.set(null);
        this.geoUnavailableMessage.set(null);
        return;
      }

      const oid = String(o._id);

      onCleanup(() => this.clearLiveTrackingOnly());

      if (this.auth.isDriver()) {
        let lastLat = 0;
        let lastLng = 0;
        this.geoUnavailableMessage.set(null);

        this.geoSub = geolocationWatch$(this.geoWatchId)
          .pipe(throttleTime(400, undefined, { leading: true, trailing: true }))
          .subscribe({
            next: (pos) => {
              const pt = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              };

              let heading =
                typeof pos.coords.heading === 'number' && Number.isFinite(pos.coords.heading)
                  ? ((((pos.coords.heading % 360) + 360) % 360) as number)
                  : null;

              const moved = Math.abs(pt.lat - lastLat) > 1e-7 || Math.abs(pt.lng - lastLng) > 1e-7;
              if (
                heading === null &&
                moved &&
                (lastLat !== 0 || lastLng !== 0) &&
                (lastLat !== pt.lat || lastLng !== pt.lng)
              ) {
                heading = bearingDegrees({ lat: lastLat, lng: lastLng }, pt);
              }
              lastLat = pt.lat;
              lastLng = pt.lng;

              if (heading != null) this.driverHeadingDeg.set(heading);
              this.enqueueDriverTarget(pt);
              this.maybeEmitDriverLocationThrottle(oid, pt, heading ?? undefined);
            },
            error: () => {
              this.geoUnavailableMessage.set('Location permission denied or unavailable.');
            },
          });
      } else if (this.auth.isCustomer()) {
        this.socket.connect();
        this.socket.emitJoinOrderTracking(oid);
        this.joinedOrderId = oid;

        this.socketUnsub = this.socket.onCustomerLocationUpdate((p) => {
          const pt = { lat: p.lat, lng: p.lng };
          if (p.heading != null && Number.isFinite(p.heading)) {
            this.driverHeadingDeg.set((((Number(p.heading) % 360) + 360) % 360));
          } else if (this.lastEmit) {
            this.driverHeadingDeg.set(bearingDegrees(this.lastEmit, pt));
          }
          this.lastEmit = pt;
          this.enqueueDriverTarget(pt);
        });
      } else if (o.driverLocation?.lat != null && o.driverLocation?.lng != null) {
        const h = o.driverLocation.heading;
        if (typeof h === 'number' && Number.isFinite(h)) this.driverHeadingDeg.set(h % 360);
        this.enqueueDriverTarget({ lat: o.driverLocation.lat, lng: o.driverLocation.lng });
        untracked(() => this.scheduleFitBoundsDebounced(true));
      }
    });
  }

  private clearLiveTrackingOnly(): void {
    this.geoSub?.unsubscribe();
    this.geoSub = null;
    if (this.socketUnsub) {
      this.socketUnsub();
      this.socketUnsub = null;
    }
    if (this.joinedOrderId) {
      this.socket.emitLeaveOrderTracking(this.joinedOrderId);
      this.joinedOrderId = null;
    }
    if (this.geoWatchId.current !== null) {
      navigator.geolocation.clearWatch(this.geoWatchId.current);
      this.geoWatchId.current = null;
    }
    if (this.animRafId !== null) {
      cancelAnimationFrame(this.animRafId);
      this.animRafId = null;
    }
    if (this.fitRafId !== null) {
      cancelAnimationFrame(this.fitRafId);
      this.fitRafId = null;
    }
    this.lastEmit = null;
    this.lastFitAt = 0;
    this.lastHydratedDriverDbKey = '';
    this.segFrom = null;
    this.segTo = null;
  }

  private lastEmitThrottle = 0;
  private maybeEmitDriverLocationThrottle(
    oid: string,
    pt: { lat: number; lng: number },
    heading?: number,
  ): void {
    const now = Date.now();
    if (now - this.lastEmitThrottle < DRIVER_SOCKET_EMIT_MS) return;
    this.lastEmitThrottle = now;
    this.socket.emitDriverLocation({
      orderId: oid,
      lat: pt.lat,
      lng: pt.lng,
      heading: heading ?? null,
    });
  }

  private positionAt(nowMs: number): { lat: number; lng: number } {
    if (!this.segFrom || !this.segTo) {
      const cur = this.driverMarkerPosition();
      return cur ?? { lat: 0, lng: 0 };
    }
    const u = clamp01((nowMs - this.segStartMs) / ROUTE_ANIM_MS);
    return {
      lat: lerp(this.segFrom.lat, this.segTo.lat, u),
      lng: lerp(this.segFrom.lng, this.segTo.lng, u),
    };
  }

  private enqueueDriverTarget(pt: { lat: number; lng: number }): void {
    const now = performance.now();
    if (this.driverMarkerPosition() === null) {
      this.segFrom = { ...pt };
      this.segTo = { ...pt };
      this.segStartMs = now;
      this.driverMarkerPosition.set({ ...pt });
      return;
    }
    const from = this.positionAt(now);
    this.segFrom = from;
    this.segTo = { ...pt };
    this.segStartMs = now;
    this.ensureAnimLoop();
  }

  private ensureAnimLoop(): void {
    if (this.animRafId !== null) return;

    const tick = () => {
      this.animRafId = requestAnimationFrame((ts) => {
        this.driverMarkerPosition.set(this.positionAt(ts));

        if (!this.segFrom || !this.segTo) {
          this.animRafId = null;
          return;
        }
        const u = (ts - this.segStartMs) / ROUTE_ANIM_MS;
        if (u < 1) {
          tick();
        } else {
          this.driverMarkerPosition.set({ ...this.segTo });
          this.segFrom = { ...this.segTo };
          this.animRafId = null;
          /** One debounced refit after the lerp — not every frame (that was causing visible map “blinks”). */
          untracked(() => this.scheduleFitBoundsDebounced(false));
        }
      });
    };
    tick();
  }

  private scheduleFitBoundsDebounced(force: boolean): void {
    if (this.fitRafId !== null && !force) return;
    if (this.fitRafId !== null) cancelAnimationFrame(this.fitRafId);

    const now = Date.now();
    if (!force && now - this.lastFitAt < 180) {
      this.fitRafId = requestAnimationFrame(() => {
        this.fitRafId = null;
        if (Date.now() - this.lastFitAt >= 170) this.applyThreePointBounds();
      });
      return;
    }

    this.fitRafId = requestAnimationFrame(() => {
      this.fitRafId = null;
      this.applyThreePointBounds();
    });
  }

  /** Google Maps equivalent of Leaflet `invalidateSize()` — required after dialogs open or layout settles. */
  private triggerGoogleMapResize(): void {
    try {
      const map = this.mapComp?.googleMap;
      if (map) google.maps.event.trigger(map, 'resize');
    } catch {
      /* ignore */
    }
  }

  private applyThreePointBounds(): void {
    this.lastFitAt = Date.now();
    const map = this.mapComp?.googleMap;
    const o = this.order();
    if (!map || !o?.pickupLocation?.lat) return;

    const bounds = new google.maps.LatLngBounds();

    bounds.extend({
      lat: o.pickupLocation.lat,
      lng: o.pickupLocation.lng,
    });
    bounds.extend({
      lat: o.dropoffLocation.lat,
      lng: o.dropoffLocation.lng,
    });

    const dirs = this.directionsResult();
    const rb = dirs?.routes?.[0]?.bounds;
    if (rb) bounds.union(rb);

    const drv = this.driverMarkerPosition();
    if (
      drv &&
      (this.auth.isDriver()
        ? isDriverRoutePreviewTrackingStatus(o.status)
        : isCustomerRouteDriverTrackingStatus(o.status))
    ) {
      bounds.extend(drv);
    }

    map.fitBounds(bounds, MAP_FIT_PADDING);
  }

  onClose(): void {
    this.clearLiveTrackingOnly();
    this.directionsSub?.unsubscribe();
    this.directionsSub = null;
    this.directionsResult.set(null);
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.onClose();
  }

  onMapInitialized(): void {
    requestAnimationFrame(() => {
      this.triggerGoogleMapResize();
      untracked(() => this.scheduleFitBoundsDebounced(true));
    });
  }
}
