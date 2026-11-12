/** Brand green used for vehicle icons on cards and on the map. */
const VEHICLE_GREEN = '#21c45d';

export type DriverMapVehicle = 'pickup' | 'van' | 'truck';

/** Lucide `car` — the pickup glyph used on move cards. */
const PICKUP_NODES: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> = [
  [
    'path',
    {
      d: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2',
    },
  ],
  ['circle', { cx: '7', cy: '17', r: '2' }],
  ['path', { d: 'M9 17h6' }],
  ['circle', { cx: '17', cy: '17', r: '2' }],
];

/** Lucide `van`. */
const VAN_NODES: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> = [
  [
    'path',
    {
      d: 'M13 6v5a1 1 0 0 0 1 1h6.102a1 1 0 0 1 .712.298l.898.91a1 1 0 0 1 .288.702V17a1 1 0 0 1-1 1h-3',
    },
  ],
  [
    'path',
    { d: 'M5 18H3a1 1 0 0 1-1-1V8a2 2 0 0 1 2-2h12c1.1 0 2.1.8 2.4 1.8l1.176 4.2' },
  ],
  ['path', { d: 'M9 18h5' }],
  ['circle', { cx: '16', cy: '18', r: '2' }],
  ['circle', { cx: '7', cy: '18', r: '2' }],
];

/** Lucide `truck`. */
const TRUCK_NODES: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> = [
  ['path', { d: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2' }],
  ['path', { d: 'M15 18H9' }],
  [
    'path',
    {
      d: 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14',
    },
  ],
  ['circle', { cx: '17', cy: '18', r: '2' }],
  ['circle', { cx: '7', cy: '18', r: '2' }],
];

function markerSvg(nodes: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]>): string {
  const shapes = nodes
    .map(([tag, attrs]) => {
      const rendered = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${rendered}/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <circle cx="24" cy="24" r="22" fill="#10241c" stroke="${VEHICLE_GREEN}" stroke-width="2"/>
  <g transform="translate(12 12)" fill="none" stroke="${VEHICLE_GREEN}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>
</svg>`;
}

const VEHICLE_MARKER_SVG: Record<DriverMapVehicle, string> = {
  pickup: markerSvg(PICKUP_NODES),
  van: markerSvg(VAN_NODES),
  truck: markerSvg(TRUCK_NODES),
};

/** Pickup, van, or truck. Legacy minivan uses the van marker. Unknown values are ignored. */
export function driverMapVehicleKind(type: string | null | undefined): DriverMapVehicle | null {
  switch (String(type ?? '').trim().toLowerCase()) {
    case 'pickup':
    case 'small':
      return 'pickup';
    case 'van':
    case 'minivan':
      return 'van';
    case 'truck':
    case 'large':
      return 'truck';
    default:
      return null;
  }
}

/**
 * Prefer the driver's own vehicle. Fall back to the move's vehicle, then pickup.
 */
export function resolveDriverMapVehicle(
  driverVehicleType?: string | null,
  orderVehicleType?: string | null,
): DriverMapVehicle {
  return driverMapVehicleKind(driverVehicleType) ?? driverMapVehicleKind(orderVehicleType) ?? 'pickup';
}

/** `google.maps.Icon` for the driver marker. Load the Maps API before calling. */
export function buildDriverCarGoogleIcon(vehicle: DriverMapVehicle = 'pickup'): google.maps.Icon {
  const gm = google.maps;
  const svg = VEHICLE_MARKER_SVG[vehicle] ?? VEHICLE_MARKER_SVG.pickup;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new gm.Size(48, 48),
    anchor: new gm.Point(24, 24),
  };
}
