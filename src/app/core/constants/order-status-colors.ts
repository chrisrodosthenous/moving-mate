/**
 * Order lifecycle status colors. Night shift: gray pending, green for the live trip.
 */
export const ORDER_STATUS_COLORS = {
  accepted: {
    background: 'rgba(74, 222, 128, 0.15)',
    foreground: '#4ADE80',
    border: '#243044',
  },
  inProgress: {
    background: 'rgba(34, 197, 94, 0.22)',
    foreground: '#22C55E',
    border: '#243044',
  },
  completed: {
    background: 'rgba(34, 197, 94, 0.30)',
    foreground: '#052E16',
    border: '#22C55E',
  },
} as const;

/** Progress bar segment fill (index 1–3 match Accepted / On the way / Done). */
export const ORDER_SEGMENT_BAR_COLORS: Record<0 | 1 | 2 | 3, string> = {
  0: '#93A4B8',
  1: '#4ADE80',
  2: '#22C55E',
  3: '#F4F7FB',
};
