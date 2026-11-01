import {
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { merge, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { GoogleMapsLoaderService } from '../../../../core/services/google-maps-loader.service';
import type { DriverTrackingPoint } from '../../../../core/services/tracking.service';
import { TrackingService } from '../../../../core/services/tracking.service';
import { buildDriverCarGoogleIcon } from '../../../../shared/utils/driver-map-car-icon';
import {
  routeEndpointMarkerOptions,
  routeLinePolylineOptions,
  routePathFromDirections,
} from '../../../../shared/utils/route-map-markers';

function normalizeSeed(seed: unknown): DriverTrackingPoint | null {
  if (!seed || typeof seed !== 'object') return null;
  const lat = Number((seed as Record<string, unknown>)['lat']);
  const lng = Number((seed as Record<string, unknown>)['lng']);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const out: DriverTrackingPoint = { lat, lng };
  const h = Number((seed as Record<string, unknown>)['heading']);
  if (Number.isFinite(h) && h >= 0 && h <= 360) {
    out.heading = h;
  }
  return out;
}

function sameCoord(a: DriverTrackingPoint, b: DriverTrackingPoint): boolean {
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
}

const MAP_PADDING = 56;

@Component({
  selector: 'app-tracking',
  standalone: true,
  templateUrl: './tracking.component.html',
  styleUrl: './tracking.component.css',
})
export class TrackingComponent {
  private readonly trackingSvc = inject(TrackingService);
  private readonly mapsLoader = inject(GoogleMapsLoaderService);
  private readonly injector = inject(Injector);

  readonly mapRoot = viewChild.required<ElementRef<HTMLElement>>('mapRoot');

  readonly orderId = input('');
  readonly mapsReady = input(false);
  readonly pickup = input.required<{ lat: number; lng: number }>();
  readonly dropoff = input.required<{ lat: number; lng: number }>();
  readonly seedDriverLocation = input<{ lat: number; lng: number; heading?: number | null } | null | undefined>(
    undefined,
  );

  readonly driverLocation = signal<DriverTrackingPoint | null>(null);

  /**
   * True only after imperative `initializeMap()` finishes — hides `#map` during the mandated pre-init delay +
   * init work so passengers never see grey tiles prematurely.
   */
  readonly mapRevealVisible = signal(false);

  readonly sdkReady = signal(false);

  private mapInitialized = false;

  private map: google.maps.Map | null = null;
  private pickupMarker: google.maps.Marker | null = null;
  private dropoffMarker: google.maps.Marker | null = null;
  private driverMarker: google.maps.Marker | null = null;
  private routeLine: google.maps.Polyline | null = null;

  private subscription: Subscription | null = null;

  constructor() {
    const seed$ = toObservable(this.seedDriverLocation, { injector: this.injector }).pipe(
      map(normalizeSeed),
      filter((p): p is DriverTrackingPoint => p != null),
      distinctUntilChanged(sameCoord),
    );

    effect((onCleanup) => {
      const oid = String(this.orderId() ?? '').trim();
      const ready = this.mapsReady();
      untracked(() => {
        this.subscription?.unsubscribe();
        this.subscription = null;
        this.teardownMapRuntime();
      });

      if (!oid || !ready) {
        return;
      }

      const stream$ = merge(seed$, this.trackingSvc.getDriverLocation(oid)).pipe(distinctUntilChanged(sameCoord));

      onCleanup(() => {
        untracked(() => {
          this.subscription?.unsubscribe();
          this.subscription = null;
          this.teardownMapRuntime();
        });
      });

      untracked(() => {
        this.subscription = stream$.subscribe((location: DriverTrackingPoint) => {
          if (!location) return;

          this.driverLocation.set(location);

          if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return;

          if (!this.mapInitialized) {
            setTimeout(() => {
              void (async (): Promise<void> => {
                await this.initializeMap();
                this.mapInitialized = true;
                this.sdkReady.set(true);
                this.invalidateMapSize();
                this.updateDriverMarker();
                this.mapRevealVisible.set(true);
                setTimeout(() => this.invalidateMapSize(), 100);
              })();
            }, 300);
          } else {
            this.updateDriverMarker();
          }
        });
      });
    });

  }

  private async initializeMap(): Promise<void> {
    await this.mapsLoader.ensureLoaded();

    const el = this.mapRoot().nativeElement;
    if (!el || typeof google === 'undefined') return;

    const pickup = this.pickup();
    const dropoff = this.dropoff();
    const center = {
      lat: (pickup.lat + dropoff.lat) / 2,
      lng: (pickup.lng + dropoff.lng) / 2,
    };

    this.map = new google.maps.Map(el, {
      zoom: 12,
      center,
      mapTypeControl: true,
      zoomControl: true,
      streetViewControl: false,
    });

    this.pickupMarker = new google.maps.Marker({
      ...routeEndpointMarkerOptions('pickup'),
      map: this.map,
      position: pickup,
    });
    this.dropoffMarker = new google.maps.Marker({
      ...routeEndpointMarkerOptions('dropoff'),
      map: this.map,
      position: dropoff,
    });

    this.drawRoute();
    this.fitAllBounds();
    this.invalidateMapSize();
    setTimeout(() => this.invalidateMapSize(), 120);
  }

  private drawRoute(): void {
    if (!this.map || typeof google === 'undefined') return;
    const pickup = this.pickup();
    const dropoff = this.dropoff();
    new google.maps.DirectionsService().route(
      {
        origin: pickup,
        destination: dropoff,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (!this.map || status !== google.maps.DirectionsStatus.OK || !result) return;
        const path = routePathFromDirections(result);
        if (path.length < 2) return;
        if (!this.routeLine) {
          this.routeLine = new google.maps.Polyline({
            ...routeLinePolylineOptions(),
            map: this.map,
            path,
          });
        } else {
          this.routeLine.setPath(path);
          this.routeLine.setMap(this.map);
        }
        this.fitAllBounds();
      },
    );
  }

  private updateDriverMarker(): void {
    const loc = this.driverLocation();
    if (!loc || !this.map || typeof google === 'undefined') return;

    const driverCarIcon = buildDriverCarGoogleIcon();
    const driveOpts: google.maps.MarkerOptions = {
      title: 'Driver',
      zIndex: 999,
      optimized: false,
      icon: driverCarIcon,
    };

    if (!this.driverMarker) {
      this.driverMarker = new google.maps.Marker({
        ...driveOpts,
        map: this.map,
        position: { lat: loc.lat, lng: loc.lng },
      });
    } else {
      this.driverMarker.setMap(this.map);
      this.driverMarker.setPosition({ lat: loc.lat, lng: loc.lng });
      this.driverMarker.setOptions(driveOpts);
    }

    this.fitAllBounds();
    if (this.mapInitialized && this.map) {
      setTimeout(() => this.invalidateMapSize(), 100);
    }
  }

  private fitAllBounds(): void {
    if (!this.map || typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(this.pickup());
    bounds.extend(this.dropoff());

    const drv = this.driverLocation();
    if (drv) bounds.extend(drv);

    this.map.fitBounds(bounds, MAP_PADDING);
  }

  /** Leaflet-style `invalidateSize()` equivalent for Google Maps. */
  private invalidateMapSize(): void {
    if (!this.map || typeof google === 'undefined') return;
    google.maps.event.trigger(this.map, 'resize');
    this.fitAllBounds();
  }

  private teardownMapRuntime(): void {
    if (typeof google !== 'undefined' && google.maps?.event?.clearInstanceListeners && this.map) {
      google.maps.event.clearInstanceListeners(this.map);
    }
    this.pickupMarker?.setMap(null);
    this.dropoffMarker?.setMap(null);
    this.driverMarker?.setMap(null);
    this.routeLine?.setMap(null);

    this.map = null;
    this.pickupMarker = null;
    this.dropoffMarker = null;
    this.driverMarker = null;
    this.routeLine = null;

    this.mapInitialized = false;
    this.sdkReady.set(false);
    this.driverLocation.set(null);
    this.mapRevealVisible.set(false);
  }
}
