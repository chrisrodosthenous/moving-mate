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

/** Line only. Callers cannot turn Google's pins back on. */
export function routeLineRendererOptions(
  extra: Omit<google.maps.DirectionsRendererOptions, 'suppressMarkers'> = {},
): google.maps.DirectionsRendererOptions {
  return { ...extra, suppressMarkers: true };
}
