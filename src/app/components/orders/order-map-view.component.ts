import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GoogleMap, MapDirectionsRenderer, MapMarker } from '@angular/google-maps';
import { UiButtonComponent } from '@/components/ui/button';
import type { PlaceResult } from '../../shared/directives/places-autocomplete.directive';

@Component({
  selector: 'app-order-map-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GoogleMap, MapDirectionsRenderer, MapMarker, UiButtonComponent],
  templateUrl: './order-map-view.component.html',
  styleUrl: './order-map-view.component.css',
})
export class OrderMapViewComponent {
  /** True when the Google Maps script has finished loading. */
  readonly mapsEmbedReady = input(false);
  /** True when the core maps library failed to load. */
  readonly mapsLoadFailed = input(false);
  readonly center = input.required<google.maps.LatLngLiteral>();
  readonly zoom = input.required<number>();
  readonly mapOptionsWithClick = input.required<google.maps.MapOptions>();
  readonly directionsResult = input<google.maps.DirectionsResult | null>(null);
  /** Pickup (A) / dropoff (B) markers when set. */
  readonly pickup = input<PlaceResult | null>(null);
  readonly dropoff = input<PlaceResult | null>(null);
  readonly pickupMarkerOptions = input.required<google.maps.MarkerOptions>();
  readonly dropoffMarkerOptions = input.required<google.maps.MarkerOptions>();
  /** When true, the mobile FAB to open the form is hidden. */
  readonly drawerOpen = input(false);
  /** Hide sidebar offset on map column when the customer route already has a shell sidebar. */
  readonly hideShell = input(false);

  readonly mapInitialized = output<google.maps.Map>();
  readonly mapClick = output<google.maps.MapMouseEvent>();
  readonly openDrawer = output<void>();
}
