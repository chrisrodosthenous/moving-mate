import { Injectable, inject } from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { environment } from '../../../environments/environment';
import { LoggerService } from './logger.service';

export type GoogleMapsLibraryName = 'places' | 'geocoding' | 'routes';

export interface GoogleMapsLoadResult {
  /** True when `google.maps.Map` is available — enough to mount `<google-map>`. */
  mapReady: boolean;
  placesReady: boolean;
  geocodingReady: boolean;
  routesReady: boolean;
}

/**
 * Loads the Maps JavaScript API via @googlemaps/js-api-loader (official dynamic loader).
 * Call {@link ensureLoaded} once at app startup (APP_INITIALIZER) and/or before mounting `<google-map>`.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {
  private readonly logger = inject(LoggerService);
  private loadPromise: Promise<boolean> | null = null;
  private loadResult: GoogleMapsLoadResult | null = null;

  /** Last load outcome (null until {@link ensureLoaded} finishes). */
  getLoadResult(): GoogleMapsLoadResult | null {
    return this.loadResult;
  }

  /**
   * Resolves when the core `maps` library is ready (map can mount).
   * Additional libraries (`places`, `geocoding`, `routes`) load best-effort — failures are logged but do not block the map.
   */
  ensureLoaded(): Promise<boolean> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      if (typeof window === 'undefined') return false;

      const key = (environment.googleMapsApiKey || '').trim();
      if (!key) {
        this.logger.error(
          '[MovingMate] Google Maps: `googleMapsApiKey` is empty in environment — set it in src/environments/environment.ts.',
        );
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
        await importLibrary('maps');

        const result: GoogleMapsLoadResult = {
          mapReady: !!window.google?.maps?.Map,
          placesReady: false,
          geocodingReady: false,
          routesReady: false,
        };

        await this.loadOptionalLibrary('places', () => !!window.google?.maps?.places?.Autocomplete, result, 'placesReady');
        await this.loadOptionalLibrary('geocoding', () => !!window.google?.maps?.Geocoder, result, 'geocodingReady');
        await this.loadOptionalLibrary(
          'routes',
          () => !!(window.google?.maps?.DirectionsService && window.google?.maps?.DistanceMatrixService),
          result,
          'routesReady',
        );

        this.loadResult = result;

        if (!result.mapReady) {
          this.logger.error('[MovingMate] Google Maps: Map class unavailable after loading.');
          return false;
        }

        if (!result.placesReady) {
          this.logger.warn('[MovingMate] Google Maps: Places unavailable — enable Places API on your browser key.');
        }
        if (!result.geocodingReady) {
          this.logger.warn('[MovingMate] Google Maps: Geocoding unavailable — enable Geocoding API on your browser key.');
        }
        if (!result.routesReady) {
          this.logger.warn(
            '[MovingMate] Google Maps: Routes unavailable — enable Directions API + Distance Matrix API on your browser key.',
          );
        }

        return true;
      } catch (err) {
        this.logger.error('[MovingMate] Google Maps API failed to load (invalid key, billing, or network):', err);
        this.loadResult = {
          mapReady: false,
          placesReady: false,
          geocodingReady: false,
          routesReady: false,
        };
        return false;
      }
    })();

    return this.loadPromise;
  }

  private async loadOptionalLibrary(
    library: GoogleMapsLibraryName,
    isReady: () => boolean,
    result: GoogleMapsLoadResult,
    resultKey: keyof Pick<GoogleMapsLoadResult, 'placesReady' | 'geocodingReady' | 'routesReady'>,
  ): Promise<void> {
    try {
      await importLibrary(library);
      result[resultKey] = isReady();
      if (!result[resultKey]) {
        this.logger.warn(`[MovingMate] Google Maps: ${library} imported but API class missing.`);
      }
    } catch (err) {
      this.logger.warn(`[MovingMate] Google Maps: failed to load "${library}" library.`, err);
      result[resultKey] = false;
    }
  }
}
