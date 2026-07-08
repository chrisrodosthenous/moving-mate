import {
  Directive,
  ElementRef,
  Output,
  EventEmitter,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';

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

  private autocomplete: google.maps.places.Autocomplete | null = null;
  private listener: google.maps.MapsEventListener | null = null;

  constructor(private el: ElementRef<HTMLInputElement>) {}

  ngAfterViewInit(): void {
    this.initAutocomplete();
  }

  ngOnDestroy(): void {
    this.listener?.remove?.();
    this.autocomplete = null;
  }

  private initAutocomplete(): void {
    const g = window.google;
    if (g?.maps?.places?.Autocomplete) {
      this.setupAutocomplete(g);
      return;
    }
    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      const gm = window.google;
      if (gm?.maps?.places?.Autocomplete) {
        clearInterval(id);
        this.setupAutocomplete(gm);
      } else if (attempts > 50) {
        clearInterval(id);
      }
    }, 100);
  }

  private setupAutocomplete(g: typeof google): void {
    this.autocomplete = new g.maps.places.Autocomplete(this.el.nativeElement, {
      fields: ['formatted_address', 'geometry'],
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
