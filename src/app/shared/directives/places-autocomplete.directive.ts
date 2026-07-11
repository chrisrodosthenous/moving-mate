import {
  Directive,
  ElementRef,
  Output,
  EventEmitter,
  AfterViewInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { GoogleMapsLoaderService } from '../../core/services/google-maps-loader.service';
import { LoggerService } from '../../core/services/logger.service';

export interface PlaceResult {
  address: string;
  lat: number;
  lng: number;
}

declare global {
  interface Window {
    google?: typeof google;
  }
}

@Directive({
  selector: 'input[appPlacesAutocomplete]',
  standalone: true,
})
export class PlacesAutocompleteDirective implements AfterViewInit, OnDestroy {
  @Output() placeSelected = new EventEmitter<PlaceResult>();

  private readonly el = inject(ElementRef<HTMLInputElement>);
  private readonly mapsLoader = inject(GoogleMapsLoaderService);
  private readonly logger = inject(LoggerService);

  private autocomplete: google.maps.places.Autocomplete | null = null;
  private listener: google.maps.MapsEventListener | null = null;

  ngAfterViewInit(): void {
    void this.initAutocomplete();
  }

  ngOnDestroy(): void {
    this.listener?.remove?.();
    this.autocomplete = null;
  }

  private async initAutocomplete(): Promise<void> {
    const loaded = await this.mapsLoader.ensureLoaded();
    const placesReady = this.mapsLoader.getLoadResult()?.placesReady;
    const g = window.google;

    if (!loaded || !placesReady || !g?.maps?.places?.Autocomplete) {
      this.logger.warn(
        '[MovingMate] Places autocomplete unavailable. Check that your browser key allows Places API and moving-mate.com referrers. You can still tap two points on the map.',
      );
      return;
    }

    this.setupAutocomplete(g);
  }

  private setupAutocomplete(g: typeof google): void {
    this.autocomplete = new g.maps.places.Autocomplete(this.el.nativeElement, {
      fields: ['formatted_address', 'geometry', 'name'],
      types: ['geocode'],
      componentRestrictions: { country: 'cy' },
    });
    this.listener = this.autocomplete.addListener('place_changed', () => {
      const place = this.autocomplete?.getPlace();
      if (!place?.geometry?.location) return;
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      const address = place.formatted_address || '';
      this.placeSelected.emit({ address, lat, lng });
    });
  }
}
