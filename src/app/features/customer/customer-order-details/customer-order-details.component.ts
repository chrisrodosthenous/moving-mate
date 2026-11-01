import { DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
  ViewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { GoogleMap, MapDirectionsService, MapMarker, MapPolyline } from '@angular/google-maps';
import { map } from 'rxjs/operators';
import { GoogleMapsLoaderService } from '../../../core/services/google-maps-loader.service';
import { isCustomerLiveMapTrackingStatus } from '../../../shared/utils/order-tracking';
import {
  routeEndpointMarkerOptions,
  routeLinePolylineOptions,
  routePathFromDirections,
} from '../../../shared/utils/route-map-markers';
import * as CustomerActions from '../state/customer.actions';
import { selectCustomerOrders, selectCustomerOrdersLoading } from '../state/customer.selectors';
import { SocketService } from '../../../core/services/socket.service';
import { TrackingComponent } from './tracking/tracking.component';
import { orderVehicleTypeDisplayLabel } from '../../../shared/utils/order-cargo-scoring.util';
import type { TransportOrder } from '../../../core/services/orders.service';

@Component({
  selector: 'app-customer-order-details',
  standalone: true,
  imports: [RouterLink, DecimalPipe, GoogleMap, MapMarker, MapPolyline, TrackingComponent],
  templateUrl: './customer-order-details.component.html',
  styleUrl: './customer-order-details.component.css',
})
export class CustomerOrderDetailsComponent implements OnInit {
  readonly vehicleTypeLabel = orderVehicleTypeDisplayLabel;
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly mapsLoader = inject(GoogleMapsLoaderService);
  private readonly directions = inject(MapDirectionsService);
  private readonly socket = inject(SocketService);
  readonly socketConnectionState = this.socket.socketConnectionState;

  @ViewChild(GoogleMap) private staticOverviewMap?: GoogleMap;

  readonly mapsEmbedReady = signal(false);
  readonly routePath = signal<google.maps.LatLngLiteral[]>([]);

  /** Keeps this order on screen after it leaves the active list (delivered / cancelled). */
  private readonly trackedOrder = signal<TransportOrder | null>(null);

  readonly orders = toSignal(this.store.select(selectCustomerOrders), { initialValue: [] });
  readonly loading = toSignal(this.store.select(selectCustomerOrdersLoading), { initialValue: true });

  readonly orderIdParam = toSignal(this.route.paramMap.pipe(map((p) => p.get('orderId') ?? '')), {
    initialValue: '',
  });

  readonly order = computed(() => {
    const id = this.orderIdParam();
    if (!id) return null;
    const tracked = this.trackedOrder();
    if (tracked && String(tracked._id) === id) return tracked;
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

  readonly pickupMarkerOptions = routeEndpointMarkerOptions('pickup');
  readonly dropoffMarkerOptions = routeEndpointMarkerOptions('dropoff');
  readonly routePolylineOptions = routeLinePolylineOptions();

  constructor() {
    this.socket.connect();

    effect((onCleanup) => {
      const o = this.order();
      if (!this.mapsEmbedReady() || this.showLiveTracking() || !o?.pickupLocation || !o.dropoffLocation) {
        return;
      }
      const sub = this.directions
        .route({
          origin: { lat: o.pickupLocation.lat, lng: o.pickupLocation.lng },
          destination: { lat: o.dropoffLocation.lat, lng: o.dropoffLocation.lng },
          travelMode: google.maps.TravelMode.DRIVING,
        })
        .subscribe(({ result, status }) => {
          if (status !== google.maps.DirectionsStatus.OK || !result) {
            this.routePath.set([]);
            return;
          }
          this.routePath.set(routePathFromDirections(result));
        });
      onCleanup(() => sub.unsubscribe());
    });

    effect(() => {
      const id = this.orderIdParam();
      const fromList = this.orders().find((o) => String(o._id) === id) ?? null;
      if (!id) {
        this.trackedOrder.set(null);
        return;
      }
      if (fromList) {
        this.trackedOrder.set(fromList);
        return;
      }
      const current = untracked(() => this.trackedOrder());
      if (current && String(current._id) !== id) {
        this.trackedOrder.set(null);
      }
    });

    effect(() => {
      const updated = this.socket.onOrderUpdated();
      if (!updated) return;
      this.applyLiveOrder(updated);
      this.socket.clearOrderUpdate();
    });

    effect(() => {
      const completed = this.socket.onOrderCompleted();
      if (!completed) return;
      this.applyLiveOrder(completed);
      this.socket.clearOrderCompleted();
    });
  }

  ngOnInit(): void {
    this.store.dispatch(CustomerActions.loadCustomerOrders());
    void this.mapsLoader.ensureLoaded().then((ok) => {
      this.mapsEmbedReady.set(ok);
    });
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

  private applyLiveOrder(incoming: TransportOrder): void {
    const id = this.orderIdParam();
    if (id && String(incoming._id) === id) {
      this.trackedOrder.update((cur) => (cur && String(cur._id) === id ? { ...cur, ...incoming } : incoming));
    }
    this.store.dispatch(CustomerActions.applyCustomerOrderPatch({ order: incoming }));
  }
}
