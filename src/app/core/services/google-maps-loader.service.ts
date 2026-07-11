import { Injectable, inject } from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { environment } from '../../../environments/environment';
import { LoggerService } from './logger.service';

export type GoogleMapsLibraryName = 'places' | 'geocoding' | 'routes';

export interface GoogleMapsLoadResult {
  mapReady: boolean;
  placesReady: boolean;
  geocodingReady: boolean;
  routesReady: boolean;
}

const OPTIONAL_LIBS: Array<{
  library: GoogleMapsLibraryName;
  resultKey: keyof Pick<GoogleMapsLoadResult, 'placesReady' | 'geocodingReady' | 'routesReady'>;
  isReady: () => boolean;
}> = [
  {
    library: 'places',
    resultKey: 'placesReady',
    isReady: () => !!window.google?.maps?.places?.Autocomplete,
  },
  {
    library: 'geocoding',
    resultKey: 'geocodingReady',
    isReady: () => !!window.google?.maps?.Geocoder,
  },
  {
    library: 'routes',
    resultKey: 'routesReady',
    isReady: () =>
      !!(window.google?.maps?.DirectionsService && window.google?.maps?.DistanceMatrixService),
  },
];

/**
 * Loads the Maps JavaScript API via @googlemaps/js-api-loader (official dynamic loader).
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {
  private readonly logger = inject(LoggerService);
  private loadPromise: Promise<boolean> | null = null;
  private loadResult: GoogleMapsLoadResult | null = null;

  getLoadResult(): GoogleMapsLoadResult | null {
    return this.loadResult;
  }

  /** Resolves when the core `maps` library is ready (map can mount). */
  ensureLoaded(): Promise<boolean> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadWithRetry();
    return this.loadPromise;
  }

  private async loadWithRetry(maxAttempts = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const ok = await this.loadOnce();
      if (ok) return true;
      if (attempt < maxAttempts) {
        this.logger.warn(`[MovingMate] Google Maps load attempt ${attempt} failed; retrying…`);
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    return false;
  }

  private async loadOnce(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    const key = (environment.googleMapsApiKey || '').trim();
    if (!key) {
      this.logger.error('[MovingMate] Google Maps: `googleMapsApiKey` is empty.');
      this.loadResult = {
        mapReady: false,
        placesReady: false,
        geocodingReady: false,
        routesReady: false,
      };
      return false;
    }

    try {
      setOptions({ key, v: 'weekly' });

      const result: GoogleMapsLoadResult = {
        mapReady: !!window.google?.maps?.Map,
        placesReady: !!window.google?.maps?.places?.Autocomplete,
        geocodingReady: !!window.google?.maps?.Geocoder,
        routesReady: !!(
          window.google?.maps?.DirectionsService && window.google?.maps?.DistanceMatrixService
        ),
      };

      if (!result.mapReady) {
        await importLibrary('maps');
        result.mapReady = !!window.google?.maps?.Map;
      }

      for (const entry of OPTIONAL_LIBS) {
        if (result[entry.resultKey]) continue;
        try {
          await importLibrary(entry.library);
          result[entry.resultKey] = entry.isReady();
        } catch (err) {
          this.logger.warn(`[MovingMate] Google Maps: failed to load "${entry.library}".`, err);
          result[entry.resultKey] = false;
        }
      }

      this.loadResult = result;

      if (!result.mapReady) {
        this.logger.error('[MovingMate] Google Maps: Map class unavailable after loading.');
        return false;
      }

      return true;
    } catch (err) {
      this.logger.error('[MovingMate] Google Maps API failed to load:', err);
      this.loadResult = {
        mapReady: false,
        placesReady: false,
        geocodingReady: false,
        routesReady: false,
      };
      return false;
    }
  }
}
