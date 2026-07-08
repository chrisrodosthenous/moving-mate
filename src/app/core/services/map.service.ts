import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface DistanceMatrixResult {
  distance: { text: string; value: number };
  duration: { text: string; value: number };
}

declare global {
  interface Window {
    google?: typeof google;
  }
}

/**
 * Uses the Google Maps Distance Matrix API to get distance and duration between two addresses.
 * Requires the Google Maps script (loaded from `main.ts` using `environment.googleMapsApiKey`).
 */
@Injectable({ providedIn: 'root' })
export class MapService {
  /**
   * Returns distance and duration between origin and destination addresses.
   * Origin and destination can be addresses or "lat,lng" strings.
   */
  getDistanceAndDuration(
    origin: string,
    destination: string
  ): Observable<DistanceMatrixResult> {
    return new Observable((subscriber) => {
      const g = typeof window !== 'undefined' ? window.google : undefined;
      if (!g?.maps?.DistanceMatrixService) {
        subscriber.error(
          new Error(
            'Google Maps API is not loaded. Ensure the script is included and the map has been used at least once.'
          )
        );
        return;
      }

      const service = new g.maps.DistanceMatrixService();
      service.getDistanceMatrix(
        {
          origins: [origin],
          destinations: [destination],
          travelMode: g.maps.TravelMode.DRIVING,
        },
        (response, status) => {
          if (status !== g.maps.DistanceMatrixStatus.OK) {
            subscriber.error(new Error(`DistanceMatrix request failed: ${status}`));
            return;
          }
          const row = response?.rows?.[0];
          const element = row?.elements?.[0];
          if (!element || element.status !== g.maps.DistanceMatrixElementStatus.OK) {
            subscriber.error(
              new Error(
                element?.status === g.maps.DistanceMatrixElementStatus.ZERO_RESULTS
                  ? 'No route found between the two addresses.'
                  : `Distance Matrix element error: ${element?.status ?? 'unknown'}`
              )
            );
            return;
          }
          subscriber.next({
            distance: {
              text: element.distance.text,
              value: element.distance.value,
            },
            duration: {
              text: element.duration.text,
              value: element.duration.value,
            },
          });
          subscriber.complete();
        }
      );
    });
  }

  /**
   * Reverse geocode lat/lng to a formatted address.
   * On success: returns { address, isCoordinatesFallback: false }.
   * On failure: returns { address: "lat, lng", isCoordinatesFallback: true } so the UI can show a fallback message.
   */
  reverseGeocode(lat: number, lng: number): Observable<{ address: string; isCoordinatesFallback: boolean }> {
    return new Observable((subscriber) => {
      const g = typeof window !== 'undefined' ? window.google : undefined;
      if (!g?.maps?.Geocoder) {
        subscriber.next({
          address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          isCoordinatesFallback: true,
        });
        subscriber.complete();
        return;
      }
      const geocoder = new g.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === g.maps.GeocoderStatus.OK && results?.[0]?.formatted_address) {
          subscriber.next({
            address: results[0].formatted_address,
            isCoordinatesFallback: false,
          });
        } else {
          subscriber.next({
            address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
            isCoordinatesFallback: true,
          });
        }
        subscriber.complete();
      });
    });
  }
}
