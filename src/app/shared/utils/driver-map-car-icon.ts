/** Brand primary fill + mist highlight stroke. */
const DRIVER_CAR_FILL = '#22C55E';
const DRIVER_CAR_STROKE = '#F0EDE6';

/** Top-down car SVG; default orientation is north (“up”). */
export const DRIVER_CAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <path fill="${DRIVER_CAR_FILL}" stroke="${DRIVER_CAR_STROKE}" stroke-width="1.25" stroke-linejoin="round"
    d="M24 8c-4.2 0-7.5 2.4-8.6 6.2L13 22.5c-.6 1.8-1 3.6-1 5.5v6c0 1.1.9 2 2 2h2.2c.5 2.3 2.5 4 4.8 4s4.3-1.7 4.8-4h4.4c.5 2.3 2.5 4 4.8 4s4.3-1.7 4.8-4H42c1.1 0 2-.9 2-2v-6c0-1.9-.4-3.7-1-5.5l-2.4-8.3C39.5 10.4 36.2 8 32 8H24zm-1.2 14h2.4c.7 0 1.2.6 1.2 1.3V26c0 .7-.5 1.2-1.2 1.2h-2.4c-.7 0-1.2-.5-1.2-1.2v-2.7c0-.7.5-1.3 1.2-1.3z"/>
  <ellipse cx="15.5" cy="34" fill="${DRIVER_CAR_STROKE}" opacity="0.35" rx="3" ry="1.6"/>
  <ellipse cx="32.5" cy="34" fill="${DRIVER_CAR_STROKE}" opacity="0.35" rx="3" ry="1.6"/>
</svg>`;

/** `google.maps.Icon` for markers (calls into global `google` — load Maps API first). */
export function buildDriverCarGoogleIcon(): google.maps.Icon {
  const gm = google.maps;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(DRIVER_CAR_SVG),
    scaledSize: new gm.Size(48, 48),
    anchor: new gm.Point(24, 28),
  };
}
