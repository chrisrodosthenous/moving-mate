import { DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { GoogleMap, MapMarker } from '@angular/google-maps';
import { map } from 'rxjs/operators';
import { GoogleMapsLoaderService } from '../../../core/services/google-maps-loader.service';
import { LoggerService } from '../../../core/services/logger.service';
import { isCustomerLiveMapTrackingStatus } from '../../../shared/utils/order-tracking';
import * as CustomerActions from '../state/customer.actions';
import { selectCustomerOrders, selectCustomerOrdersLoading } from '../state/customer.selectors';
import { SocketService } from '../../../core/services/socket.service';
import { TrackingComponent } from './tracking/tracking.component';
import { orderVehicleTypeDisplayLabel } from '../../../shared/utils/order-cargo-scoring.util';

const LOCATION_POLL_MS = 25_000;

@Component({
  selector: 'app-customer-order-details',
  standalone: true,
  imports: [RouterLink, DecimalPipe, GoogleMap, MapMarker, TrackingComponent],
  templateUrl: './customer-order-details.component.html',
  styleUrl: './customer-order-details.component.css',
})
export class CustomerOrderDetailsComponent implements OnInit, OnDestroy {
  readonly vehicleTypeLabel = orderVehicleTypeDisplayLabel;
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly mapsLoader = inject(GoogleMapsLoaderService);
  private readonly logger = inject(LoggerService);
  readonly socketConnectionState = inject(SocketService).socketConnectionState;

  @ViewChild(GoogleMap) private staticOverviewMap?: GoogleMap;

  readonly mapsEmbedReady = signal(false);
  readonly customerLocation = signal<{ lat: number; lng: number } | null>(null);

  private ordersPollTimer: ReturnType<typeof setInterval> | null = null;

  readonly orders = toSignal(this.store.select(selectCustomerOrders), { initialValue: [] });
  readonly loading = toSignal(this.store.select(selectCustomerOrdersLoading), { initialValue: true });

  readonly orderIdParam = toSignal(this.route.paramMap.pipe(map((p) => p.get('orderId') ?? '')), {
    initialValue: '',
  });

  readonly order = computed(() => {
    const id = this.orderIdParam();
    if (!id) return null;
    return this.orders().find((o) => String(o._id) === id) ?? null;
  });

  readonly showLiveTracking = computed(() => {
    const o = this.order();
    return !!o && isCustomerLiveMapTrackingStatus(o.status);
  });

  readonly mapBaselineCenter = computed(() => {
    const o = this.order();
    if (!o) return { lat: 35.1264, lng: 33.4299 };
    return {
      lat: (o.pickupLocation.lat + o.dropoffLocation.lat) / 2,
      lng: (o.pickupLocation.lng + o.dropoffLocation.lng) / 2,
    };
  });

  readonly mapBaselineZoom = 12;

  readonly mapOptions: google.maps.MapOptions = {
    mapTypeControl: true,
    zoomControl: true,
    streetViewControl: false,
  };

  readonly pickupMarkerOptions: google.maps.MarkerOptions = {
    label: { text: 'A', color: '#F0EDE6' },
    title: 'Pickup',
    zIndex: 10,
  };

  readonly dropoffMarkerOptions: google.maps.MarkerOptions = {
    label: { text: 'B', color: '#F0EDE6' },
    title: 'Destination',
    zIndex: 11,
  };

  readonly customerMarkerOptions = computed(
    (): google.maps.MarkerOptions => ({
      title: 'You',
      icon: {
        path: typeof google !== 'undefined' ? google.maps.SymbolPath.CIRCLE : 0,
        fillColor: '#22C55E',
        fillOpacity: 0.92,
        strokeColor: '#F0EDE6',
        strokeWeight: 3,
        scale: 8,
      },
      zIndex: 800,
    }),
  );

  constructor() {
    effect((onCleanup) => {
      const loading = this.loading();
      const o = this.order();
      if (loading || !o || !isCustomerLiveMapTrackingStatus(o.status)) {
        this.stopOrdersPoll();
        return;
      }

      this.startOrdersPoll();
      onCleanup(() => this.stopOrdersPoll());
    });
  }

  ngOnInit(): void {
    this.store.dispatch(CustomerActions.loadCustomerOrders());
    void this.mapsLoader.ensureLoaded().then((ok) => {
      this.mapsEmbedReady.set(ok);
    });

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.customerLocation.set({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          this.triggerStaticResize();
        },
        () => {
          this.logger.log('[CustomerLiveMap] geolocation unavailable or denied');
        },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
      );
    }
  }

  ngOnDestroy(): void {
    this.stopOrdersPoll();
  }

  /** Non-live Angular map only — live route uses imperative {@link TrackingComponent}. */
  onStaticMapInitialized(): void {
    this.triggerStaticResize();
  }

  private triggerStaticResize(): void {
    setTimeout(() => {
      const m = this.staticOverviewMap?.googleMap;
      if (!m || typeof google === 'undefined') return;
      google.maps.event.trigger(m, 'resize');
    }, 0);
  }

  private startOrdersPoll(): void {
    this.stopOrdersPoll();
    this.ordersPollTimer = setInterval(() => {
      this.store.dispatch(CustomerActions.loadCustomerOrdersSilent());
    }, LOCATION_POLL_MS);
  }

  private stopOrdersPoll(): void {
    if (this.ordersPollTimer) {
      clearInterval(this.ordersPollTimer);
      this.ordersPollTimer = null;
    }
  }
}
