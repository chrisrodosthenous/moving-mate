/// <reference types="google.maps" />
/**
 * Route endpoint markers drawn by us.
 * DirectionsRenderer's own pins stay off — those glyphs render as a broken icon above a green dot.
 * The circle path is a string so these options can be created before the Maps script loads.
 */

/** Circle centered on (0, 0). Radius 8 × scale 2 = 32px, large enough for the A/B letter. */
const ROUTE_ENDPOINT_PATH = 'M 0,0 m -8,0 a 8,8 0 1,1 16,0 a 8,8 0 1,1 -16,0';

const ROUTE_ENDPOINT_FILL = '#22C55E';
const ROUTE_ENDPOINT_STROKE = '#F0EDE6';

export type RouteEndpoint = 'pickup' | 'dropoff';

export function routeEndpointMarkerOptions(endpoint: RouteEndpoint): google.maps.MarkerOptions {
  const pickup = endpoint === 'pickup';
  return {
    title: pickup ? 'Pickup' : 'Destination',
    zIndex: pickup ? 10 : 11,
    optimized: false,
    label: {
      text: pickup ? 'A' : 'B',
      color: ROUTE_ENDPOINT_STROKE,
      fontSize: '14px',
      fontWeight: '700',
    },
    icon: {
      path: ROUTE_ENDPOINT_PATH,
      scale: 2,
      fillColor: ROUTE_ENDPOINT_FILL,
      fillOpacity: 1,
      strokeColor: ROUTE_ENDPOINT_STROKE,
      strokeWeight: 2,
    },
  };
}

/** Road line drawn by us, so it stays visible when Google's own pins are hidden. */
const ROUTE_LINE_COLOR = '#22C55E';
const ROUTE_LINE_WEIGHT = 5;

export function routeLinePolylineOptions(): google.maps.PolylineOptions {
  return {
    strokeColor: ROUTE_LINE_COLOR,
    strokeOpacity: 1,
    strokeWeight: ROUTE_LINE_WEIGHT,
    clickable: false,
    zIndex: 1,
  };
}

type LatLngLike = {
  lat: number | (() => number);
  lng: number | (() => number);
};

type DirectionsLegMetrics = {
  distance?: { value?: number | null } | null;
  duration?: { text?: string | null } | null;
  steps?: Array<{ path?: unknown }> | null;
};

export interface RouteDirectionsPath {
  routes?: Array<{
    legs?: Array<DirectionsLegMetrics | null> | null;
    overview_path?: unknown;
  }> | null;
}

export interface RouteLegMetrics {
  distanceKm: number;
  durationText: string;
}

function isLatLngLike(value: unknown): value is LatLngLike {
  if (!value || typeof value !== 'object') return false;
  const point = value as LatLngLike;
  const latOk = typeof point.lat === 'number' || typeof point.lat === 'function';
  const lngOk = typeof point.lng === 'number' || typeof point.lng === 'function';
  return latOk && lngOk;
}

function readLatLng(value: unknown): google.maps.LatLngLiteral | null {
  if (!isLatLngLike(value)) return null;
  const lat = typeof value.lat === 'function' ? value.lat() : value.lat;
  const lng = typeof value.lng === 'function' ? value.lng() : value.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function pointsFrom(value: unknown): google.maps.LatLngLiteral[] {
  let list: unknown[] = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (
    value &&
    typeof value === 'object' &&
    typeof (value as { getArray?: unknown }).getArray === 'function'
  ) {
    const array = (value as { getArray: () => unknown }).getArray();
    list = Array.isArray(array) ? array : [];
  }

  const points: google.maps.LatLngLiteral[] = [];
  for (const entry of list) {
    const point = readLatLng(entry);
    if (!point) continue;
    const previous = points[points.length - 1];
    if (previous && previous.lat === point.lat && previous.lng === point.lng) continue;
    points.push(point);
  }
  return points;
}

/**
 * Driving path for our polyline.
 * Step paths follow the road; overview_path is the fallback when steps are missing.
 */
export function routePathFromDirections(
  result: RouteDirectionsPath | null | undefined,
): google.maps.LatLngLiteral[] {
  const route = result?.routes?.[0];
  if (!route) return [];

  const detailed: google.maps.LatLngLiteral[] = [];
  for (const leg of route.legs ?? []) {
    for (const step of leg?.steps ?? []) {
      const segment = pointsFrom(step?.path);
      if (segment.length === 0) continue;
      const previous = detailed[detailed.length - 1];
      const first = segment[0];
      if (previous && previous.lat === first.lat && previous.lng === first.lng) {
        detailed.push(...segment.slice(1));
      } else {
        detailed.push(...segment);
      }
    }
  }
  if (detailed.length >= 2) return detailed;
  return pointsFrom(route.overview_path);
}

/** Driving kilometres and duration from the first leg. Null when that leg has no distance. */
export function routeMetricsFromDirections(
  result: RouteDirectionsPath | null | undefined,
): RouteLegMetrics | null {
  const leg = result?.routes?.[0]?.legs?.[0];
  const meters = leg?.distance?.value;
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) return null;
  const durationText = typeof leg?.duration?.text === 'string' ? leg.duration.text.trim() : '';
  return { distanceKm: meters / 1000, durationText };
}

/** Line only. Callers cannot turn Google's pins back on. */
export function routeLineRendererOptions(
  extra: Omit<google.maps.DirectionsRendererOptions, 'suppressMarkers'> = {},
): google.maps.DirectionsRendererOptions {
  return { ...extra, suppressMarkers: true };
}
