import { Component, signal, effect, inject, OnInit, OnDestroy } from '@angular/core';
import { GoogleMap, MapMarker } from '@angular/google-maps';
import { OrdersService, TransportOrder } from '../../../core/services/orders.service';
import { SocketService } from '../../../core/services/socket.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';

const CYPRUS_CENTER = { lat: 35.1264, lng: 33.4299 };

const GREEN_ICON: google.maps.Symbol = {
  path: 'M 0,0 m -8,0 a 8,8 0 1,1 16,0 a 8,8 0 1,1 -16,0',
  scale: 2,
  fillColor: '#22c55e',
  fillOpacity: 1,
  strokeColor: '#F0EDE6',
  strokeWeight: 2,
};

function markerOptions(accepted: boolean): google.maps.MarkerOptions {
  return accepted ? { icon: GREEN_ICON } : {};
}

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [GoogleMap, MapMarker, SidebarComponent],
  templateUrl: './map-view.component.html',
  styleUrl: './map-view.component.css',
})
export class MapViewComponent implements OnInit, OnDestroy {
  private ordersService = inject(OrdersService);
  private socket = inject(SocketService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  readonly center = CYPRUS_CENTER;
  readonly zoom = 8;
  readonly options: google.maps.MapOptions = {
    mapTypeControl: true,
    zoomControl: true,
    scrollwheel: true,
    disableDoubleClickZoom: false,
    maxZoom: 18,
    minZoom: 4,
  };

  myOrders = signal<TransportOrder[]>([]);

  markerPositions = signal<{ orderId: string; pos: { lat: number; lng: number }; label: string; accepted: boolean }[]>([]);

  constructor() {
    effect(() => {
      const updated = this.socket.onOrderUpdated();
      if (updated) {
        this.toast.show('A driver has accepted your request!');
        this.myOrders.update((list) =>
          list.map((o) => (o._id === updated._id ? updated : o))
        );
        this.updateMarkerPositions();
        this.socket.clearOrderUpdate();
      }
    });
    effect(() => {
      const completed = this.socket.onOrderCompleted();
      if (completed) {
        this.toast.show('Your move has been completed!', 'success');
        this.myOrders.update((list) =>
          list.map((o) => (o._id === completed._id ? completed : o))
        );
        this.updateMarkerPositions();
        this.socket.clearOrderCompleted();
      }
    });
  }

  ngOnInit(): void {
    this.socket.connect();
    this.loadMyOrders();
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
  }

  private loadMyOrders(): void {
    this.ordersService.getMyOrders().subscribe({
      next: ({ orders }) => {
        this.myOrders.set(orders);
        this.updateMarkerPositions();
      },
    });
  }

  private updateMarkerPositions(): void {
    const orders = this.myOrders();
    const positions: { orderId: string; pos: { lat: number; lng: number }; label: string; accepted: boolean }[] = [];
    orders.forEach((o, i) => {
      const accepted = o.status === 'accepted' || o.status === 'in_progress' || o.status === 'completed';
      positions.push({
        orderId: o._id,
        pos: o.pickupLocation,
        label: `P${i + 1}`,
        accepted,
      });
      positions.push({
        orderId: o._id,
        pos: o.dropoffLocation,
        label: `D${i + 1}`,
        accepted,
      });
    });
    this.markerPositions.set(positions);
  }

  getMarkerOptions(accepted: boolean): google.maps.MarkerOptions {
    return markerOptions(accepted);
  }
}
