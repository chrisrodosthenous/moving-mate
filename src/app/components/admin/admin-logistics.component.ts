import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
  untracked,
  ViewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { GoogleMap, MapDirectionsRenderer, MapMarker } from '@angular/google-maps';
import { AdminOrder } from '../../core/services/admin.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { orderStatusToBadgeVariant } from '../../shared/utils/order-tracking';
import { orderSubmissionDateIso } from '../../shared/utils/order-utils';
import {
  adminOrderCargoTotal,
  adminOrderCustomerContact,
  adminOrderCustomerName,
  adminOrderStatusLabel,
} from '../../shared/utils/admin-order-display';
import { UiBadgeComponent } from '@/components/ui/badge';
import { UiButtonComponent } from '@/components/ui/button';
import { ADMIN_LOGISTICS_TAB, type AdminLogisticsTabId } from '../../core/constants/statuses';

const CYPRUS_CENTER = { lat: 35.1264, lng: 33.4299 };

@Component({
  selector: 'app-admin-logistics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GoogleMap,
    MapDirectionsRenderer,
    MapMarker,
    DatePipe,
    EmptyStateComponent,
    UiBadgeComponent,
    UiButtonComponent,
  ],
  templateUrl: './admin-logistics.component.html',
  styleUrl: './admin-panels.css',
})
export class AdminLogisticsComponent implements AfterViewInit {
  protected readonly logisticsTabEnum = ADMIN_LOGISTICS_TAB;
  readonly orderStatusToBadgeVariant = orderStatusToBadgeVariant;
  readonly submissionDateIso = orderSubmissionDateIso;
  readonly statusLabel = adminOrderStatusLabel;
  readonly customerName = adminOrderCustomerName;
  readonly customerContact = adminOrderCustomerContact;
  readonly cargoTotal = adminOrderCargoTotal;

  readonly mapOptions: google.maps.MapOptions = {
    mapTypeControl: true,
    zoomControl: true,
    scrollwheel: true,
    maxZoom: 18,
    minZoom: 4,
  };

  /** Live driver GPS from server (when order is active and coordinates exist). */
  readonly driverLiveMarkerOptions: google.maps.MarkerOptions = {
    title: 'Driver (live position)',
    zIndex: 950,
  };

  readonly filteredOrders = input<AdminOrder[]>([]);
  /** Orders to fit on the map (focused selection within current filter). */
  readonly mapOrders = input<AdminOrder[]>([]);
  readonly selectedLogisticsTab = input.required<AdminLogisticsTabId>();
  readonly selectedOrder = input<AdminOrder | null>(null);
  readonly licenseBaseUrl = input<string>('');

  readonly logisticsTabChange = output<AdminLogisticsTabId>();
  readonly orderSelect = output<AdminOrder>();
  readonly closeDrawer = output<void>();
  readonly openImagePreview = output<string>();

  @ViewChild(GoogleMap) map?: GoogleMap;

  mapCenter = signal<google.maps.LatLngLiteral>(CYPRUS_CENTER);
  mapZoom = signal<number>(8);
  directionsResult = signal<google.maps.DirectionsResult | null>(null);
  private routeRequestId = 0;

  constructor() {
    effect(() => {
      const list = this.mapOrders();
      untracked(() => {
        this.fitMapToOrders(list);
        this.forceMapResize();
      });
    });
    effect(() => {
      const o = this.selectedOrder();
      untracked(() => {
        this.directionsResult.set(null);
        if (o) this.renderRoadRoute(o);
      });
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.forceMapResize(), 100);
  }

  /** Public hook for parent to call after view updates (e.g. drawer open/close). */
  mapResize(): void {
    this.forceMapResize();
  }

  private fitMapToOrders(orders: AdminOrder[]): void {
    if (!orders.length) {
      this.mapCenter.set(CYPRUS_CENTER);
      this.mapZoom.set(8);
      this.directionsResult.set(null);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    orders.forEach((o) => {
      bounds.extend(o.pickupLocation);
      bounds.extend(o.dropoffLocation);
      const d = o.driverLocation;
      if (d && Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
        bounds.extend({ lat: d.lat, lng: d.lng });
      }
    });
    const center = bounds.getCenter();
    this.mapCenter.set({ lat: center.lat(), lng: center.lng() });
    this.mapZoom.set(orders.length === 1 ? 11 : 8);
    this.map?.fitBounds(bounds);
  }

  private renderRoadRoute(order: AdminOrder): void {
    const requestId = ++this.routeRequestId;
    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: order.pickupLocation.lat, lng: order.pickupLocation.lng },
        destination: { lat: order.dropoffLocation.lat, lng: order.dropoffLocation.lng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (requestId !== this.routeRequestId) return;
        if (status === google.maps.DirectionsStatus.OK && result) {
          this.directionsResult.set(result);
          const routeBounds = result.routes[0]?.bounds;
          if (!routeBounds) return;
          let target: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral = routeBounds;
          const d = order.driverLocation;
          if (d && Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
            const ext = new google.maps.LatLngBounds();
            ext.union(routeBounds);
            ext.extend({ lat: d.lat, lng: d.lng });
            target = ext;
          }
          this.map?.fitBounds(target);
        } else {
          this.directionsResult.set(null);
        }
      }
    );
  }

  private forceMapResize(): void {
    const m = this.map?.googleMap;
    if (!m) return;
    google.maps.event.trigger(m, 'resize');
    if (this.directionsResult()?.routes?.[0]?.bounds) {
      m.fitBounds(this.directionsResult()!.routes[0].bounds);
    } else {
      m.setCenter(this.mapCenter());
    }
  }
}
