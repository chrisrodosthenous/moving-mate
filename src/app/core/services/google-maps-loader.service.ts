import { Injectable, inject } from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { environment } from '../../../environments/environment';
import { LoggerService } from './logger.service';

/**
 * Loads the Maps JavaScript API via @googlemaps/js-api-loader (official dynamic loader).
 * Call {@link ensureLoaded} once at app startup (APP_INITIALIZER) and/or before mounting `<google-map>`.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {
  private readonly logger = inject(LoggerService);
  private loadPromise: Promise<boolean> | null = null;

  /**
   * Resolves when `maps` + `places` libraries are available on `window.google.maps`, or `false` if skipped/failed.
   * Safe to call multiple times (shared promise).
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
        return false;
      }

      try {
        // Must run before any importLibrary; only the first call applies (package dedupes).
        setOptions({ key, v: 'weekly' });
        await importLibrary('maps');
        await importLibrary('places');
        try {
          await importLibrary('routes');
        } catch {
          this.logger.warn('[MovingMate] Google Maps: optional `routes` library failed (directions may be limited).');
        }
        const ok = !!(window.google?.maps?.Map && window.google?.maps?.places);
        if (!ok) {
          this.logger.error('[MovingMate] Google Maps: libraries loaded but `google.maps` is incomplete.');
        }
        return ok;
      } catch (err) {
        this.logger.error('[MovingMate] Google Maps API failed to load (invalid key, billing, or network):', err);
        return false;
      }
    })();

    return this.loadPromise;
  }
}
