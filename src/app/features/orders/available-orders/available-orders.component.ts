import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GoogleMap, MapMarker, MapDirectionsRenderer, MapDirectionsService } from '@angular/google-maps';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Subject, merge, interval, of } from 'rxjs';
import { catchError, finalize, map, switchMap, tap } from 'rxjs/operators';

import { LoggerService } from '../../../core/services/logger.service';
import { OrdersService, TransportOrder, ORDERS_API_BASE } from '../../../core/services/orders.service';
import { ToastService } from '../../../core/services/toast.service';
import { CargoPhotoLightboxComponent } from '../../../shared/components/cargo-photo-lightbox/cargo-photo-lightbox.component';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';

const CYPRUS_CENTER = { lat: 35.1264, lng: 33.4299 };
/** Auto-refresh interval for the available list (no full page reload). */
const AVAILABLE_ORDERS_POLL_MS = 20_000;

export interface RouteInfo {
  distanceKm: number;
  durationMinutes: number;
  distanceText: string;
  durationText: string;
}

@Component({
  selector: 'app-available-orders',
  standalone: true,
  imports: [
    GoogleMap,
    MapMarker,
    MapDirectionsRenderer,
    DatePipe,
    DecimalPipe,
    SidebarComponent,
    EmptyStateComponent,
    CargoPhotoLightboxComponent,
  ],
  templateUrl: './available-orders.component.html',
  styleUrl: './available-orders.component.css',
})
export class AvailableOrdersComponent implements OnInit {
  private ordersService = inject(OrdersService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);
  private directionsService = inject(MapDirectionsService);
  private readonly logger = inject(LoggerService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Reference to the map for fitBounds (set in template via mapInitialized) */
  private mapInstance: google.maps.Map | null = null;

  orders = signal<TransportOrder[]>([]);
  selectedOrder = signal<TransportOrder | null>(null);
  loading = signal(false);
  acceptingId = signal<string | null>(null);
  error = signal('');
  /** Driving route for selected order (A → B) */
  directionsResult = signal<google.maps.DirectionsResult | null>(null);
  /** Distance & duration from directions for the selected order */
  routeInfo = signal<RouteInfo | null>(null);
  cargoLightboxUrl = signal<string | null>(null);
  /** True briefly while a background poll is in flight (subtle Refresh affordance only). */
  readonly silentRefreshing = signal(false);

  private readonly manualRefresh$ = new Subject<void>();

  readonly center = signal<{ lat: number; lng: number }>(CYPRUS_CENTER);
  readonly zoom = 10;
  readonly mapOptions: google.maps.MapOptions = {
    mapTypeControl: true,
    zoomControl: true,
    scrollwheel: true,
    maxZoom: 18,
    minZoom: 4,
  };
  /** Blue route line, no default markers (we use A/B markers) */
  readonly directionsRendererOptions: google.maps.DirectionsRendererOptions = {
    suppressMarkers: true,
    preserveViewport: true,
    polylineOptions: {
      strokeColor: '#22C55E',
      strokeOpacity: 1,
      strokeWeight: 5,
    },
  };

  readonly pickupPosition = computed(() => {
    const o = this.selectedOrder();
    return o?.pickupLocation
      ? { lat: o.pickupLocation.lat, lng: o.pickupLocation.lng }
      : null;
  });

  readonly dropoffPosition = computed(() => {
    const o = this.selectedOrder();
    return o?.dropoffLocation
      ? { lat: o.dropoffLocation.lat, lng: o.dropoffLocation.lng }
      : null;
  });

  ngOnInit(): void {
    merge(
      of('init' as const),
      interval(AVAILABLE_ORDERS_POLL_MS).pipe(
        tap(() => console.log('--- AUTO-REFRESH STARTING ---')),
        map(() => 'auto' as const),
      ),
      this.manualRefresh$.pipe(map(() => 'manual' as const)),
    )
      .pipe(
        switchMap((source) => {
          const isQuiet = source === 'auto';
          if (isQuiet) {
            this.silentRefreshing.set(true);
          } else {
            this.loading.set(true);
          }
          this.error.set('');
          /** One HTTP request at a time; errors recover so the polling stream never terminates. */
          return this.ordersService.getOrders({ skipGlobalErrorToast: true, limit: 10, offset: 0 }).pipe(
            catchError((err) => {
              console.error('[AvailableOrders] getOrders failed (will retry on next tick):', err);
              return of([]);
            }),
            tap((list) => {
              const rows = Array.isArray(list) ? list : (list as { orders?: TransportOrder[] }).orders ?? [];
              this.orders.set([...rows]);
              this.logger.log('AvailableOrders: orders snapshot length', rows.length);
              this.cdr.markForCheck();
              this.cdr.detectChanges();
            }),
            finalize(() => {
              if (isQuiet) {
                this.silentRefreshing.set(false);
              } else {
                this.loading.set(false);
              }
              this.cdr.detectChanges();
            }),
          );
        }),
        /** Unsubscribe interval + merge when the route component is destroyed. */
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        error: (e) =>
          console.error('[AvailableOrders] unexpected refresh subscription error:', e),
      });
  }

  /** Initial, manual (Refresh), and timer-driven loads share one pipeline; `switchMap` drops stale in-flight requests. */
  loadOrders(): void {
    this.manualRefresh$.next();
  }

  onMapReady(map: google.maps.Map): void {
    this.mapInstance = map;
  }

  selectOrder(order: TransportOrder): void {
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
    this.directionsService
      .route({
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      })
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

          const bounds = result.routes?.[0]?.bounds;
          if (bounds && this.mapInstance) {
            setTimeout(() => {
              this.mapInstance?.fitBounds(bounds, 40);
            }, 100);
          }
        },
      });
  }

  acceptOrder(order: TransportOrder, event?: Event): void {
    event?.stopPropagation();
    this.confirmDialog.confirm('Are you sure you want to accept this order?', 'Accept Order').subscribe((ok) => {
      if (!ok) return;
      this.acceptingId.set(order._id);
      this.error.set('');
      this.ordersService.updateOrder(order._id, 'accepted').subscribe({
      next: () => {
        this.toast.show('Order accepted successfully!', 'success');
        this.orders.update((list) => list.filter((o) => o._id !== order._id));
        if (this.selectedOrder()?._id === order._id) {
          this.selectedOrder.set(null);
          this.center.set(CYPRUS_CENTER);
          this.directionsResult.set(null);
          this.routeInfo.set(null);
        }
      },
      error: () => {
        /* Error toast: httpErrorInterceptor */
      },
      complete: () => this.acceptingId.set(null),
    });
    });
  }

  isAccepting(order: TransportOrder): boolean {
    return this.acceptingId() === order._id;
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
}
