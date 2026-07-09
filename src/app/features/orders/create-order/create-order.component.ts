import { Component, DestroyRef, ElementRef, inject, OnDestroy, OnInit, signal, computed, viewChild, effect } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { merge, of, fromEvent } from 'rxjs';
import { debounceTime, finalize, map, take } from 'rxjs/operators';
import { LucideAngularModule } from 'lucide-angular';
import { MapDirectionsService } from '@angular/google-maps';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { customerBookingSuccess } from '../../../shared/components/customer/customer-animations';
import { OrderMapViewComponent } from '../../../components/orders/order-map-view.component';
import { OrderFormComponent } from '../../../components/orders/order-form.component';
import { OrderSummaryComponent } from '../../../components/orders/order-summary.component';
import { MapService } from '../../../core/services/map.service';
import { GoogleMapsLoaderService } from '../../../core/services/google-maps-loader.service';
import { OrdersService } from '../../../core/services/orders.service';
import type { CreateOrderPayload } from '../../../core/services/orders.service';
import type { OrderLaborRequired, OrderVehicleType, OrderCargoInventory } from '../../../core/models/order.model';
import {
  EMPTY_CARGO_INVENTORY,
  computeCargoScore,
  totalCargoItems,
  vehicleTypeFromCargoInventory,
  normalizeCargoQuantity,
} from '../../../shared/utils/order-cargo-scoring.util';
import { calculateOrderPrice, type OrderPriceBreakdown } from '../../../shared/utils/order-pricing.util';
import { ToastService } from '../../../core/services/toast.service';
import { LoggerService } from '../../../core/services/logger.service';
import type { PlaceResult } from '../../../shared/directives/places-autocomplete.directive';
import * as CustomerActions from '../../customer/state/customer.actions';
import {
  selectCustomerCreateError,
  selectCustomerCreateSubmitting,
} from '../../customer/state/customer.selectors';

const CYPRUS_CENTER = { lat: 35.1264, lng: 33.4299 };

/** Must match server CYPRUS_DISTRICTS. */
export const CYPRUS_PICKUP_DISTRICTS = ['Nicosia', 'Limassol', 'Larnaca', 'Paphos', 'Famagusta'] as const;

/** Map focus when a pickup district is chosen (no route markers yet). */
export const DISTRICT_MAP_CENTERS: Record<
  (typeof CYPRUS_PICKUP_DISTRICTS)[number],
  google.maps.LatLngLiteral
> = {
  Nicosia: { lat: 35.1856, lng: 33.3823 },
  Limassol: { lat: 34.7071, lng: 33.0226 },
  Larnaca: { lat: 34.9002, lng: 33.6232 },
  Paphos: { lat: 34.772, lng: 32.4297 },
  Famagusta: { lat: 35.121, lng: 33.9192 },
};

const DISTRICT_FOCUS_ZOOM = 12;

function isCyprusPickupDistrict(v: string): v is (typeof CYPRUS_PICKUP_DISTRICTS)[number] {
  return (CYPRUS_PICKUP_DISTRICTS as readonly string[]).includes(v);
}
const SERVICE_START = 9;
const SERVICE_END = 21;

/** All 30-min time slots from 09:00 to 21:00. */
function buildAllTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = SERVICE_START; h <= SERVICE_END; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    if (h < SERVICE_END) slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

const ALL_TIME_SLOTS = buildAllTimeSlots();

/** Same default as React `NewOrder.jsx` (`tomorrowDateString`). */
function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-create-order',
  standalone: true,
  imports: [
    SidebarComponent,
    OrderMapViewComponent,
    OrderFormComponent,
    OrderSummaryComponent,
    ReactiveFormsModule,
    LucideAngularModule,
  ],
  templateUrl: './create-order.component.html',
  styleUrl: './create-order.component.css',
  animations: [customerBookingSuccess],
})
export class CreateOrderComponent implements OnInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly mapService = inject(MapService);
  private readonly googleMapsLoader = inject(GoogleMapsLoaderService);
  private readonly directionsService = inject(MapDirectionsService);
  private readonly ordersService = inject(OrdersService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  /** Scroll target for “open form” from map FAB (stacked & tablet; hidden on `lg+`). */
  private readonly orderFormPanel = viewChild<ElementRef<HTMLElement>>('orderFormPanel');

  /** Mandatory packaging / liability acknowledgement. `requiredTrue` ⇒ must be checked to submit. */
  readonly safetyForm = this.fb.nonNullable.group({
    safetyConsent: this.fb.nonNullable.control<boolean>(false, {
      validators: Validators.requiredTrue,
    }),
  });

  /** Logistics details collected on the New Order form (floors, elevator, labor; vehicleType is auto-assigned). */
  readonly logisticsForm = this.fb.nonNullable.group({
    vehicleType: this.fb.nonNullable.control<OrderVehicleType>('pickup'),
    pickupFloor: this.fb.nonNullable.control('0'),
    destinationFloor: this.fb.nonNullable.control('0'),
    hasElevator: this.fb.nonNullable.control(false),
    laborRequired: this.fb.nonNullable.control<OrderLaborRequired>('none'),
  });

  /** Customer cargo inventory — drives automatic vehicle tier selection. */
  readonly cargoInventory = signal<OrderCargoInventory>({ ...EMPTY_CARGO_INVENTORY });
  readonly cargoScore = computed(() => computeCargoScore(this.cargoInventory()));
  readonly assignedVehicleType = computed(() => vehicleTypeFromCargoInventory(this.cargoInventory()));
  readonly totalCargoItems = computed(() => totalCargoItems(this.cargoInventory()));

  readonly safetyConsentValid = toSignal(
    merge(of(null), this.safetyForm.valueChanges, this.safetyForm.statusChanges).pipe(
      map(() => this.safetyForm.controls.safetyConsent.valid),
    ),
    { initialValue: false },
  );

  /** Reactive logistics values for live pricing breakdown. */
  private readonly logisticsValues = toSignal(
    merge(of(this.logisticsForm.getRawValue()), this.logisticsForm.valueChanges).pipe(
      map(() => this.logisticsForm.getRawValue()),
    ),
    { initialValue: this.logisticsForm.getRawValue() },
  );

  /** Live tier-based pricing — mirrors server `orderPricing.js`. */
  readonly pricingBreakdown = computed((): OrderPriceBreakdown | null => {
    const km = this.distanceKm();
    if (km == null) return null;
    const logistics = this.logisticsValues();
    return calculateOrderPrice({
      vehicleType: this.assignedVehicleType(),
      distanceKm: km,
      pickupFloor: logistics.pickupFloor,
      destinationFloor: logistics.destinationFloor,
      hasElevator: logistics.hasElevator,
      laborRequired: logistics.laborRequired,
    });
  });

  readonly price = computed(() => this.pricingBreakdown()?.total ?? 0);

  private mapInstance: google.maps.Map | null = null;
  private districtPanIdleListener: google.maps.MapsEventListener | null = null;

  readonly cyprusPickupDistricts = [...CYPRUS_PICKUP_DISTRICTS];
  pickup = signal<PlaceResult | null>(null);
  dropoff = signal<PlaceResult | null>(null);
  distanceKm = signal<number | null>(null);
  durationText = signal<string>('');
  directionsResult = signal<google.maps.DirectionsResult | null>(null);
  loading = signal(false);
  error = signal('');
  /** Hides the yellow map tip after the user taps the map (mobile space). */
  mapTouched = signal(false);
  showBookingSuccess = signal(false);

  readonly createSubmitting = toSignal(this.store.select(selectCustomerCreateSubmitting), {
    initialValue: false,
  });
  readonly createErrorFromStore = toSignal(this.store.select(selectCustomerCreateError), {
    initialValue: null,
  });
  /**
   * Right-side drawer: open by default so the form is visible immediately.
   * (React NewOrder keeps the form always on-screen; a closed drawer looked like a blank page.)
   */
  drawerOpen = signal(true);

  /**
   * True after {@link GoogleMapsLoaderService} has loaded the JS API (`@googlemaps/js-api-loader`).
   * `<google-map>` must not mount until then (its constructor throws if `google` is missing).
   */
  readonly mapsEmbedReady = signal(false);

  readonly defaultCenter = CYPRUS_CENTER;
  readonly defaultZoom = 8;
  /**
   * After a district is chosen (and map panned), kept in sync with the map on `idle` so
   * `[center]` updates do not cancel an in-flight `panTo`.
   */
  private readonly districtViewAnchor = signal<google.maps.LatLngLiteral | null>(null);

  /** Map center: route markers win; else district anchor; else island overview. */
  readonly center = computed(() => {
    const p = this.pickup();
    const d = this.dropoff();
    if (p && d) {
      return {
        lat: (p.lat + d.lat) / 2,
        lng: (p.lng + d.lng) / 2,
      };
    }
    if (p) return { lat: p.lat, lng: p.lng };
    if (d) return { lat: d.lat, lng: d.lng };
    const anchor = this.districtViewAnchor();
    if (anchor) return anchor;
    return this.defaultCenter;
  });
  readonly zoom = computed(() => {
    const p = this.pickup();
    const d = this.dropoff();
    if (p && d) return 10;
    if (p || d) return 12;
    if (this.districtViewAnchor()) return DISTRICT_FOCUS_ZOOM;
    return this.defaultZoom;
  });
  readonly mapOptions: google.maps.MapOptions = {
    mapTypeControl: true,
    zoomControl: true,
    scrollwheel: true,
    maxZoom: 18,
    minZoom: 4,
  };
  /** Next map tap sets pickup or dropoff explicitly; crosshair cursor while active. */
  mapClickMode = signal<'pickup' | 'dropoff' | null>(null);
  readonly mapOptionsWithClick = computed(
    (): google.maps.MapOptions => ({
      ...this.mapOptions,
      ...(this.mapClickMode() ? { draggableCursor: 'crosshair' as const } : {}),
    }),
  );

  /** Date only (YYYY-MM-DD). min = today. Defaults to tomorrow (React parity). */
  scheduledDate = tomorrowDateString();
  /** Time slot e.g. "09:00", "14:30". Default 10:00 like React. */
  scheduledTime = '10:00';
  cargoFile: File | null = null;
  /** Pickup province for job routing (sent as pickupDistrict). Empty until user selects. */
  pickupDistrict = '';
  /** True when Point A was set by map click and geocoder failed (Distance Matrix still uses lat,lng). */
  pickupCoordinatesFallback = signal(false);
  dropoffCoordinatesFallback = signal(false);

  /** While reverse geocoding after a map tap — UI shows “Point Selected on Map” instead of coordinates. */
  readonly pickupGeocoding = signal(false);
  readonly dropoffGeocoding = signal(false);

  /** Read-only location field labels (never raw lat/lng). */
  readonly pickupLocationDisplay = computed(() =>
    this.getDisplayLocation(
      this.pickup()?.address,
      this.pickup()?.lat,
      this.pickup()?.lng,
      this.pickupCoordinatesFallback(),
      this.pickupGeocoding(),
    ),
  );
  readonly dropoffLocationDisplay = computed(() =>
    this.getDisplayLocation(
      this.dropoff()?.address,
      this.dropoff()?.lat,
      this.dropoff()?.lng,
      this.dropoffCoordinatesFallback(),
      this.dropoffGeocoding(),
    ),
  );

  /**
   * Maps stored place data to input copy: human address when available, otherwise confirmation phrase.
   * Coordinates are never shown — API still uses {@link pickup}/{@link dropoff} lat/lng + address.
   */
  getDisplayLocation(
    address: string | undefined,
    lat: number | undefined,
    lng: number | undefined,
    isCoordinatesFallback: boolean,
    isGeocoding: boolean,
  ): string {
    const hasCoords =
      lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
    if (!hasCoords) return '';

    if (isGeocoding || isCoordinatesFallback || this.isCoordinateLikeAddress(address)) {
      return 'Point Selected on Map';
    }
    const a = (address ?? '').trim();
    return a || 'Point Selected on Map';
  }

  /** Detect legacy coordinate literal used internally for Distance Matrix when geocoding fails. */
  isCoordinateLikeAddress(address: string | undefined): boolean {
    if (!address?.trim()) return false;
    return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(address.trim());
  }

  /** Green markers for Pickup (A) and Destination (B) — circle path works before google.maps load */
  readonly pickupMarkerOptions: google.maps.MarkerOptions = {
    icon: {
      path: 'M 0,0 m -8,0 a 8,8 0 1,1 16,0 a 8,8 0 1,1 -16,0',
      scale: 2,
      fillColor: '#22C55E',
      fillOpacity: 1,
      strokeColor: '#F0EDE6',
      strokeWeight: 2,
    },
  };
  readonly dropoffMarkerOptions: google.maps.MarkerOptions = {
    icon: {
      path: 'M 0,0 m -8,0 a 8,8 0 1,1 16,0 a 8,8 0 1,1 -16,0',
      scale: 2,
      fillColor: '#16A34A',
      fillOpacity: 1,
      strokeColor: '#F0EDE6',
      strokeWeight: 2,
    },
  };

  readonly totalBoxes = computed(() => this.totalCargoItems());

  /** Keep in sync with `confirmOrder()` guards (incl. price > 0). */
  readonly canConfirm = computed(() => {
    const p = this.pickup();
    const d = this.dropoff();
    const hasDate = !!this.scheduledDate?.trim();
    const hasTime = !!this.scheduledTime?.trim();
    const hasItems = this.totalCargoItems() > 0;
    const hasDistrict = isCyprusPickupDistrict(this.pickupDistrict);
    const hasValidPrice = this.price() > 0;
    return (
      !!p &&
      !!d &&
      hasDate &&
      hasTime &&
      hasItems &&
      hasDistrict &&
      hasValidPrice &&
      this.safetyConsentValid() &&
      !this.createSubmitting()
    );
  });

  /** When true, customer shell already shows the sidebar — hide duplicate. */
  readonly hideShell = computed(() => this.router.url.includes('/customer/'));

  /** Min for date input: today (YYYY-MM-DD). */
  readonly minDate = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();

  /** Time slots for dropdown: all when future/no date; when today, only slots after current time. */
  readonly timeSlots = computed(() => {
    const dateStr = this.scheduledDate?.trim();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (!dateStr || dateStr > todayStr) return [...ALL_TIME_SLOTS];
    const h = now.getHours();
    const m = now.getMinutes();
    const currentSlotMinutes = h * 60 + (m < 30 ? 0 : 30);
    return ALL_TIME_SLOTS.filter((slot) => {
      const [sh, sm] = slot.split(':').map(Number);
      return sh * 60 + sm > currentSlotMinutes;
    });
  });
  private normalizeBoxValue(value: unknown): number {
    return normalizeCargoQuantity(value);
  }

  onCargoInventoryChange(key: keyof OrderCargoInventory, value: unknown): void {
    const qty = this.normalizeBoxValue(value);
    this.cargoInventory.update((cur) => ({ ...cur, [key]: qty }));
  }

  incrementCargoItem(key: keyof OrderCargoInventory): void {
    this.cargoInventory.update((cur) => ({ ...cur, [key]: cur[key] + 1 }));
  }

  decrementCargoItem(key: keyof OrderCargoInventory): void {
    this.cargoInventory.update((cur) => ({
      ...cur,
      [key]: Math.max(0, cur[key] - 1),
    }));
  }

  ngOnInit(): void {
    void this.googleMapsLoader.ensureLoaded().then((ok) => this.mapsEmbedReady.set(ok));
    fromEvent(globalThis.window, 'resize')
      .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const m = this.mapInstance;
        if (m) google.maps.event.trigger(m, 'resize');
      });
  }

  ngOnDestroy(): void {
    this.clearDistrictPanListener();
  }

  onMapInitialized(map: google.maps.Map): void {
    this.mapInstance = map;
    const invalidate = () => {
      try {
        google.maps.event.trigger(map, 'resize');
      } catch {
        /* non-fatal (tests / SSR) */
      }
    };
    queueMicrotask(invalidate);
    requestAnimationFrame(invalidate);
    setTimeout(invalidate, 120);
    setTimeout(invalidate, 450);
  }

  /**
   * Smooth pan/zoom to the district when there are no route markers yet; otherwise only updates anchor state.
   */
  onPickupDistrictChange(value: string): void {
    this.clearDistrictPanListener();

    if (!isCyprusPickupDistrict(value)) {
      this.districtViewAnchor.set(null);
      return;
    }

    const target = DISTRICT_MAP_CENTERS[value];
    const hasRoutePoints = !!(this.pickup() || this.dropoff());

    if (hasRoutePoints) {
      this.districtViewAnchor.set(target);
      return;
    }

    const map = this.mapInstance;
    if (!map) {
      this.districtViewAnchor.set(target);
      return;
    }

    map.panTo(target);
    map.setZoom(DISTRICT_FOCUS_ZOOM);
    this.scheduleCommitDistrictAnchor(target, DISTRICT_FOCUS_ZOOM);
  }

  private clearDistrictPanListener(): void {
    if (this.districtPanIdleListener) {
      google.maps.event.removeListener(this.districtPanIdleListener);
      this.districtPanIdleListener = null;
    }
  }

  private scheduleCommitDistrictAnchor(
    anchor: google.maps.LatLngLiteral,
    zoom: number,
  ): void {
    const map = this.mapInstance;
    if (!map) {
      this.districtViewAnchor.set(anchor);
      return;
    }
    this.clearDistrictPanListener();
    this.districtPanIdleListener = google.maps.event.addListenerOnce(map, 'idle', () => {
      this.districtPanIdleListener = null;
      this.districtViewAnchor.set(anchor);
      map.setZoom(zoom);
    });
  }

  constructor() {
    effect(() => {
      this.logisticsForm.controls.vehicleType.setValue(this.assignedVehicleType(), {
        emitEvent: false,
      });
    });

    this.actions$
      .pipe(ofType(CustomerActions.createCustomerOrderSuccess), takeUntilDestroyed())
      .subscribe(({ order }) => {
        this.showBookingSuccess.set(true);
        const file = this.cargoFile;
        this.cargoFile = null;
        const go = () => {
          this.showBookingSuccess.set(false);
          this.store.dispatch(CustomerActions.clearLastCreatedOrder());
          void this.router.navigate(this.hideShell() ? ['/customer/orders'] : ['/customer/dashboard']);
        };
        if (file && order._id) {
          this.ordersService.uploadOrderCargo(order._id, file, { skipGlobalErrorToast: true }).subscribe({
            next: () => this.toast.show('Cargo photo saved!', 'success'),
            error: () => this.toast.show('Order created; cargo photo upload failed.', 'info'),
            complete: () => setTimeout(go, 520),
          });
        } else {
          setTimeout(go, 620);
        }
      });
  }

  openDrawer(): void {
    this.drawerOpen.set(true);
    queueMicrotask(() => {
      if (typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches) return;
      this.orderFormPanel()?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  toggleMapSelectPickup(): void {
    const next = this.mapClickMode() === 'pickup' ? null : 'pickup';
    this.mapClickMode.set(next);
    if (next === 'pickup') {
      this.toast.show('Tap the map to set pickup (A).', 'info');
    }
  }

  toggleMapSelectDropoff(): void {
    if (!this.pickup()) {
      this.toast.show('Set pickup first.', 'info');
      return;
    }
    const next = this.mapClickMode() === 'dropoff' ? null : 'dropoff';
    this.mapClickMode.set(next);
    if (next === 'dropoff') {
      this.toast.show('Tap the map to set destination (B).', 'info');
    }
  }

  clearPickupOnly(): void {
    this.mapClickMode.set(null);
      this.pickup.set(null);
    this.pickupGeocoding.set(false);
      this.pickupCoordinatesFallback.set(false);
      this.directionsResult.set(null);
      this.distanceKm.set(null);
      this.durationText.set('');
    this.error.set('');
  }

  clearDropoffOnly(): void {
    this.mapClickMode.set(null);
      this.dropoff.set(null);
    this.dropoffGeocoding.set(false);
      this.dropoffCoordinatesFallback.set(false);
      this.directionsResult.set(null);
      this.distanceKm.set(null);
      this.durationText.set('');
    this.error.set('');
  }

  /** Clear both points and start over. */
  clearPoints(): void {
    this.mapClickMode.set(null);
    this.pickup.set(null);
    this.dropoff.set(null);
    this.pickupGeocoding.set(false);
    this.dropoffGeocoding.set(false);
    this.pickupCoordinatesFallback.set(false);
    this.dropoffCoordinatesFallback.set(false);
    this.directionsResult.set(null);
    this.distanceKm.set(null);
    this.durationText.set('');
    this.error.set('');
  }

  /** Map tap: optional mode from form buttons; otherwise 1st tap = A, 2nd = B. */
  onMapClick(event: google.maps.MapMouseEvent): void {
    this.mapTouched.set(true);
    const latLng = event.latLng;
    if (!latLng) return;
    const lat = latLng.lat();
    const lng = latLng.lng();
    const mode = this.mapClickMode();

    const applyPickup = () => {
      this.pickupGeocoding.set(true);
      this.mapService
        .reverseGeocode(lat, lng)
        .pipe(
          finalize(() => this.pickupGeocoding.set(false)),
        )
        .subscribe({
        next: ({ address, isCoordinatesFallback }) => {
          this.pickup.set({ address, lat, lng });
          this.pickupCoordinatesFallback.set(isCoordinatesFallback);
          this.error.set('');
          if (isCoordinatesFallback) {
              this.toast.show('Address not found; location still saved for the route.', 'info');
          }
          this.updateRouteAndPrice();
          this.drawerOpen.set(true);
        },
      });
    };

    const applyDropoff = () => {
      this.dropoffGeocoding.set(true);
      this.mapService
        .reverseGeocode(lat, lng)
        .pipe(
          finalize(() => this.dropoffGeocoding.set(false)),
        )
        .subscribe({
        next: ({ address, isCoordinatesFallback }) => {
          this.dropoff.set({ address, lat, lng });
          this.dropoffCoordinatesFallback.set(isCoordinatesFallback);
          this.error.set('');
          if (isCoordinatesFallback) {
              this.toast.show('Address not found; location still saved for the route.', 'info');
          }
          this.updateRouteAndPrice();
        },
      });
    };

    if (mode === 'pickup') {
      this.mapClickMode.set(null);
      applyPickup();
      return;
    }

    if (mode === 'dropoff') {
      if (!this.pickup()) {
        this.toast.show('Set pickup first.', 'info');
        return;
      }
      this.mapClickMode.set(null);
      applyDropoff();
      return;
    }

    const p = this.pickup();
    const d = this.dropoff();
    if (!p) {
      applyPickup();
      return;
    }
    if (!d) {
      applyDropoff();
    }
  }

  private updateRouteAndPrice(): void {
    const p = this.pickup();
    const d = this.dropoff();
    if (!p || !d) return;

    this.loading.set(true);
    this.directionsResult.set(null);

    this.mapService.getDistanceAndDuration(p.address, d.address).subscribe({
      next: (res) => {
        const km = res.distance.value / 1000;
        this.distanceKm.set(km);
        this.durationText.set(res.duration.text);
        this.loading.set(false);
        this.fetchDirections();
      },
      error: (err) => {
        const fallbackKm = this.fallbackDistanceKmFromCoordinates();
        if (fallbackKm != null) {
          this.distanceKm.set(fallbackKm);
          // Conservative fallback ETA for map/routing outages (~40km/h average urban pace).
          const approxMinutes = Math.max(1, Math.round((fallbackKm / 40) * 60));
          this.durationText.set(`~${approxMinutes} min`);
          this.error.set('');
          this.loading.set(false);
          this.toast.show('Using estimated distance while route service is unavailable.', 'info');
          return;
        }
        this.loading.set(false);
        this.error.set(err?.message || 'Could not calculate route.');
      },
    });
  }

  private fallbackDistanceKmFromCoordinates(): number | null {
    const p = this.pickup();
    const d = this.dropoff();
    if (!p || !d) return null;
    const pLat = Number(p.lat);
    const pLng = Number(p.lng);
    const dLat = Number(d.lat);
    const dLng = Number(d.lng);
    if ([pLat, pLng, dLat, dLng].some((n) => Number.isNaN(n))) return null;

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthKm = 6371;
    const dLatRad = toRad(dLat - pLat);
    const dLngRad = toRad(dLng - pLng);
    const a =
      Math.sin(dLatRad / 2) ** 2 +
      Math.cos(toRad(pLat)) * Math.cos(toRad(dLat)) * Math.sin(dLngRad / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const km = earthKm * c;
    return Number.isFinite(km) && km > 0 ? Number(km.toFixed(2)) : null;
  }

  private fetchDirections(): void {
    const p = this.pickup();
    const d = this.dropoff();
    if (!p || !d) return;

    this.directionsService
      .route({
        origin: p.address,
        destination: d.address,
        travelMode: google.maps.TravelMode.DRIVING,
      })
      .pipe(take(1))
      .subscribe({
        next: ({ result, status }) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            this.directionsResult.set(result);
          }
        },
      });
  }

  onCargoFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.cargoFile = file || null;
  }

  confirmOrder(): void {
    this.logger.log('[create-order] confirmOrder (ngSubmit or submitOrder)');

    const p = this.pickup();
    const d = this.dropoff();
    const pr = this.price();
    const total = this.totalCargoItems();
    const district = this.pickupDistrict;
    if (!this.safetyForm.valid) {
      this.safetyForm.markAllAsTouched();
      this.logger.warn('[create-order] confirmOrder blocked: safety consent not granted');
      return;
    }

    if (!p || !d || pr <= 0 || total <= 0 || !isCyprusPickupDistrict(district)) {
      this.logger.warn('[create-order] confirmOrder blocked', {
        hasPickup: !!p,
        hasDropoff: !!d,
        price: pr,
        totalBoxes: total,
        district,
        validDistrict: isCyprusPickupDistrict(district),
      });
      return;
    }

    this.error.set('');

    const inventory = this.cargoInventory();
    const km = this.distanceKm();
    const logistics = this.logisticsForm.getRawValue();
    const payload: CreateOrderPayload = {
      pickupLocation: { address: p.address, lat: p.lat, lng: p.lng },
      dropoffLocation: { address: d.address, lat: d.lat, lng: d.lng },
      pickupDistrict: district,
      price: Number(pr.toFixed(2)),
      ...(km != null && { distanceKm: Number(km.toFixed(2)) }),
      cargoInventory: { ...inventory },
      smallBoxes: inventory.boxes,
      mediumBoxes: inventory.mediumItems,
      largeBoxes: inventory.largeFurniture + inventory.heavyAppliances,
      vehicleType: logistics.vehicleType,
      pickupFloor: logistics.pickupFloor,
      destinationFloor: logistics.destinationFloor,
      hasElevator: logistics.hasElevator,
      laborRequired: logistics.laborRequired,
      ...(this.scheduledDate?.trim() && this.scheduledTime?.trim() && {
        scheduledAt: new Date(`${this.scheduledDate}T${this.scheduledTime}:00`).toISOString(),
      }),
    };
    this.store.dispatch(CustomerActions.createCustomerOrder({ payload }));
  }
}
