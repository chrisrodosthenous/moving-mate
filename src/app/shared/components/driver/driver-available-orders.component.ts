import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, DestroyRef, effect, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { timer } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { GoogleMap, MapMarker, MapDirectionsRenderer, MapDirectionsService } from '@angular/google-maps';
import { TransportOrder, ORDERS_API_BASE } from '../../../core/services/orders.service';
import { CargoPhotoLightboxComponent } from '../cargo-photo-lightbox/cargo-photo-lightbox.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { OrderRoutePreviewDialogComponent } from '../order-route-preview-dialog/order-route-preview-dialog.component';
import { AuthService } from '../../../core/services/auth.service';
import type { AuthUser } from '../../../store/auth.store';
import * as DriverActions from '../../../features/driver/state/driver.actions';
import { DriverJobCardComponent } from './driver-job-card/driver-job-card.component';
import { DRIVER_JOB_CTA_CLASS } from './driver-job-card/driver-job-card.theme';
import { UiButtonComponent } from '@/components/ui/button';
import {
  selectDriverAcceptBusyId,
  selectDriverAcceptError,
  selectDriverAvailableError,
  selectDriverAvailableHasMore,
  selectDriverAvailableLoading,
  selectDriverAvailableLoadingMore,
  selectDriverAvailableOrders,
  selectDriverHighlightedAvailableIds,
  selectDriverNewOrderToast,
} from '../../../features/driver/state/driver.selectors';

const CYPRUS_CENTER = { lat: 35.1264, lng: 33.4299 };
/** Background refresh interval while Available Jobs view is mounted (matches legacy available-orders page). */
const AVAILABLE_POLL_MS = 20_000;

/** Matches Tailwind `md:` (same as drawer split breakpoint). */
const MD_BREAKPOINT_QUERY = '(min-width: 768px)';

function matchMediaMdUp(): boolean {
  return typeof globalThis !== 'undefined' && 'matchMedia' in globalThis
    ? globalThis.matchMedia(MD_BREAKPOINT_QUERY).matches
    : false;
}

export interface RouteInfo {
  distanceKm: number;
  durationMinutes: number;
  distanceText: string;
  durationText: string;
}

/**
 * Lists pending jobs from {@link OrdersService.getOrders} (GET /api/orders).
 * The API returns only orders whose `pickupDistrict` is in the logged-in driver’s `districts`.
 */
@Component({
  selector: 'app-driver-available-orders',
  standalone: true,
  imports: [
    GoogleMap,
    MapMarker,
    MapDirectionsRenderer,
    RouterLink,
    EmptyStateComponent,
    CargoPhotoLightboxComponent,
    OrderRoutePreviewDialogComponent,
    UiButtonComponent,
    DriverJobCardComponent,
  ],
  templateUrl: './driver-available-orders.component.html',
  styleUrl: './driver-available-orders.component.css',
})
export class DriverAvailableOrdersComponent {
  readonly acceptBtnClass = DRIVER_JOB_CTA_CLASS;

  private readonly store = inject(Store);
  private readonly auth = inject(AuthService);
  private readonly directionsService = inject(MapDirectionsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpointObserver = inject(BreakpointObserver);

  /** Desktop split-layout (tailwind `md`); mobile uses {@link OrderRoutePreviewDialogComponent} (My Orders / My trips parity). */
  readonly isMdUp = toSignal(this.breakpointObserver.observe(MD_BREAKPOINT_QUERY).pipe(map((r) => r.matches)), {
    initialValue: matchMediaMdUp(),
  });

  /** Map instance as a signal so the layout effect re-runs when the map mounts (directions may have loaded first). */
  private readonly mapInstance = signal<google.maps.Map | null>(null);
  /** Avoid repeated fitBounds + resize churn on the *same* map instance + route. Remount ⇒ refit (new Map ref). */
  private lastDirectionsLayoutKey = '';
  private lastLaidOutMap: google.maps.Map | null = null;
  private highlightClearTimer: ReturnType<typeof setTimeout> | null = null;
  private newOrderToastTimer: ReturnType<typeof setTimeout> | null = null;
  private availableFlowStarted = false;

  readonly gateLoading = signal(true);
  readonly gateVerified = signal(false);
  readonly licenseUrl = signal('');
  readonly verificationStatus = signal<AuthUser['verificationStatus']>('none');

  readonly locked = computed(() => !this.gateLoading() && !this.gateVerified());
  readonly hasLicenseFile = computed(() => Boolean(this.licenseUrl().trim()));
  readonly lockMessage = computed(() => {
    const vs = this.verificationStatus();
    if (vs === 'rejected' && this.hasLicenseFile()) {
      return 'Your license was not approved. Please upload a new document from your profile.';
    }
    if (this.hasLicenseFile()) {
      return 'License uploaded. Waiting for admin approval.';
    }
    return 'Please upload your driving license to start accepting orders. Status: Pending Approval.';
  });

  readonly orders = toSignal(this.store.select(selectDriverAvailableOrders), { initialValue: [] });
  readonly loading = toSignal(this.store.select(selectDriverAvailableLoading), { initialValue: false });
  readonly loadingMore = toSignal(this.store.select(selectDriverAvailableLoadingMore), { initialValue: false });
  readonly hasMore = toSignal(this.store.select(selectDriverAvailableHasMore), { initialValue: false });
  readonly error = toSignal(this.store.select(selectDriverAvailableError), { initialValue: null });
  readonly acceptBusyId = toSignal(this.store.select(selectDriverAcceptBusyId), { initialValue: null });
  readonly acceptError = toSignal(this.store.select(selectDriverAcceptError), { initialValue: null });
  readonly highlightedIds = toSignal(this.store.select(selectDriverHighlightedAvailableIds), {
    initialValue: [],
  });
  readonly newOrderToast = toSignal(this.store.select(selectDriverNewOrderToast), { initialValue: false });

  selectedOrder = signal<TransportOrder | null>(null);
  directionsResult = signal<google.maps.DirectionsResult | null>(null);
  routeInfo = signal<RouteInfo | null>(null);

  readonly cargoLightboxUrl = signal<string | null>(null);

  readonly center = signal<{ lat: number; lng: number }>(CYPRUS_CENTER);
  readonly zoom = 10;
  readonly mapOptions = computed((): google.maps.MapOptions => ({
    mapTypeControl: true,
    zoomControl: true,
    maxZoom: 18,
    minZoom: 4,
    ...(this.isMdUp()
      ? { scrollwheel: false, gestureHandling: 'cooperative' as const }
      : { scrollwheel: true, gestureHandling: 'greedy' as const }),
  }));
  readonly directionsRendererOptions: google.maps.DirectionsRendererOptions = {
    suppressMarkers: true,
    /** We call `fitBounds` ourselves; default `false` makes the renderer pan/zoom too — double viewport updates read as flicker. */
    preserveViewport: true,
    polylineOptions: {
      strokeColor: '#22C55E',
      strokeOpacity: 1,
      strokeWeight: 5,
    },
  };

  readonly pickupPosition = computed(() => {
    const o = this.selectedOrder();
    return o?.pickupLocation ? { lat: o.pickupLocation.lat, lng: o.pickupLocation.lng } : null;
  });

  readonly dropoffPosition = computed(() => {
    const o = this.selectedOrder();
    return o?.dropoffLocation ? { lat: o.dropoffLocation.lat, lng: o.dropoffLocation.lng } : null;
  });

  constructor() {
    this.auth
      .checkMyStatus()
      .pipe(take(1), takeUntilDestroyed())
      .subscribe({
        next: ({ user }) => {
          this.applyGateUser(user);
          this.tryStartAvailableFlow();
        },
        error: () => {
          this.gateLoading.set(false);
          this.gateVerified.set(false);
        },
      });

    this.store
      .select(selectDriverHighlightedAvailableIds)
      .pipe(takeUntilDestroyed())
      .subscribe((ids) => {
        if (this.highlightClearTimer) clearTimeout(this.highlightClearTimer);
        if (ids.length > 0) {
          this.highlightClearTimer = setTimeout(() => {
            this.store.dispatch(DriverActions.clearDriverAvailableHighlights());
            this.highlightClearTimer = null;
          }, 550);
        }
      });

    this.store
      .select(selectDriverNewOrderToast)
      .pipe(takeUntilDestroyed())
      .subscribe((show) => {
        if (this.newOrderToastTimer) clearTimeout(this.newOrderToastTimer);
        if (show) {
          this.newOrderToastTimer = setTimeout(() => {
            this.store.dispatch(DriverActions.clearDriverNewOrderToast());
            this.newOrderToastTimer = null;
          }, 4000);
        }
      });

    effect(() => {
      const list = this.orders();
      const sel = this.selectedOrder();
      if (!sel) return;
      if (!list.some((o) => o._id === sel._id)) {
        this.clearMapSelection();
      }
    });

    /**
     * Single place for resize + fitBounds after directions + map are both ready.
     * Deduped by route key (do not also fitBounds from onMapReady — that double layout caused visible blinking).
     */
    effect(() => {
      const dirs = this.directionsResult();
      const map = this.mapInstance();
      if (!dirs || !map) return;
      const orderId = String(this.selectedOrder()?._id ?? '');
      const leg = dirs.routes?.[0]?.legs?.[0];
      const dur = leg?.duration?.value ?? 0;
      const dist = leg?.distance?.value ?? 0;
      const layoutKey = `${orderId}:${dur}:${dist}`;
      if (layoutKey === this.lastDirectionsLayoutKey && map === this.lastLaidOutMap) return;
      this.lastDirectionsLayoutKey = layoutKey;
      this.lastLaidOutMap = map;
      const bounds = dirs.routes?.[0]?.bounds;
      // After Angular has applied host dimensions; one layout pass reduces tile / overlay flicker.
      requestAnimationFrame(() => {
        const m = this.mapInstance();
        if (!m || this.directionsResult() !== dirs) return;
        google.maps.event.trigger(m, 'resize');
        if (bounds) {
          m.fitBounds(bounds, 40);
        }
      });
    });

  }

  clearMapSelection(): void {
    this.lastDirectionsLayoutKey = '';
    this.lastLaidOutMap = null;
    this.selectedOrder.set(null);
    this.center.set(CYPRUS_CENTER);
    this.directionsResult.set(null);
    this.routeInfo.set(null);
    this.mapInstance.set(null);
  }

  private applyGateUser(u: AuthUser): void {
    const verified = (u.role === 'driver' && u.isVerified === true) || u.role === 'admin';
    this.gateVerified.set(verified);
    this.licenseUrl.set(typeof u.licenseUrl === 'string' ? u.licenseUrl : '');
    this.verificationStatus.set(u.verificationStatus ?? 'none');
    this.gateLoading.set(false);
  }

  loadMoreAvailable(): void {
    this.store.dispatch(DriverActions.loadDriverAvailableMore());
  }

  private tryStartAvailableFlow(): void {
    if (!this.gateVerified() || this.availableFlowStarted) return;
    this.availableFlowStarted = true;

    this.store.dispatch(DriverActions.loadDriverAvailable({}));

    /** First emission after {@link AVAILABLE_POLL_MS}, then repeats every poll — visible log confirms timer is alive. */
    timer(AVAILABLE_POLL_MS, AVAILABLE_POLL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.store.dispatch(DriverActions.loadDriverAvailable({ silent: true })),
      );
  }

  onMapReady(map: google.maps.Map): void {
    // Updating the signal re-runs the layout effect when directions already exist (map mounted second).
    this.mapInstance.set(map);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    const map = this.mapInstance();
    if (!map || !this.selectedOrder()) return;
    if (!this.isMdUp()) return;
    requestAnimationFrame(() => {
      const m = this.mapInstance();
      if (!m) return;
      google.maps.event.trigger(m, 'resize');
      const bounds = this.directionsResult()?.routes?.[0]?.bounds;
      if (bounds) {
        m.fitBounds(bounds, 40);
      }
    });
  }

  /**
   * Card / keyboard activation: selects the job and opens the route split (delegates clicks away from nested controls).
   */
  onJobCardActivate(order: TransportOrder, event?: Event): void {
    const target = event && 'target' in event ? (event.target as HTMLElement | null) : null;
    if (target?.closest('button, a[href], input, textarea, select')) {
      return;
    }
    this.selectOrder(order);
  }

  selectOrder(order: TransportOrder): void {
    const cur = this.selectedOrder();
    if (cur && String(cur._id) === String(order._id)) {
      this.clearMapSelection();
      return;
    }
    this.selectedOrder.set(order);
    this.routeInfo.set(null);
    const p = order.pickupLocation;
    const d = order.dropoffLocation;
    this.center.set({
      lat: (p.lat + d.lat) / 2,
      lng: (p.lng + d.lng) / 2,
    });
    this.fetchDirections(p.address, d.address);
  }

  private fetchDirections(origin: string, destination: string): void {
    this.directionsResult.set(null);
    this.lastDirectionsLayoutKey = '';
    this.lastLaidOutMap = null;
    this.directionsService
      .route({
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      })
      .pipe(take(1))
      .subscribe({
        next: ({ result, status }) => {
          if (status !== google.maps.DirectionsStatus.OK || !result) return;
          this.directionsResult.set(result);

          const leg = result.routes?.[0]?.legs?.[0];
          if (leg?.distance?.value != null && leg?.duration?.value != null) {
            this.routeInfo.set({
              distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
              durationMinutes: Math.round(leg.duration.value / 60),
              distanceText: leg.distance.text ?? '',
              durationText: leg.duration.text ?? '',
            });
          }
          // fitBounds + resize: effect() and onMapReady when map + directions are both ready.
        },
      });
  }

  acceptOrder(order: TransportOrder, event?: Event): void {
    event?.stopPropagation();
    if (!this.gateVerified()) return;
    this.store.dispatch(DriverActions.acceptDriverOrder({ id: order._id }));
  }

  isAccepting(order: TransportOrder): boolean {
    return this.acceptBusyId() === order._id;
  }

  isHighlighted(id: string): boolean {
    return this.highlightedIds().includes(id);
  }

  cargoImageUrl(order: TransportOrder): string {
    return order.cargoImageUrl ? ORDERS_API_BASE + order.cargoImageUrl : '';
  }

  openCargoLightbox(order: TransportOrder, event: Event): void {
    event.stopPropagation();
    const url = this.cargoImageUrl(order);
    if (!url) return;
    if (url.toLowerCase().endsWith('.pdf')) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    this.cargoLightboxUrl.set(url);
  }

  onCargoLightboxClosed(): void {
    this.cargoLightboxUrl.set(null);
  }

  /** Stable identity for `@for` (silent refresh keeps array reference stable enough; track avoids churn). */
  trackByOrderId(_index: number, order: TransportOrder): string {
    return String(order._id);
  }
}
