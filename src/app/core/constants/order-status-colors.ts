/**
 * Order lifecycle status colors (badges, progress segments).
 * Logo green scale only — aligned with global.css status tokens.
 */
export const ORDER_STATUS_COLORS = {
  accepted: {
    background: 'rgba(74, 222, 128, 0.15)',
    foreground: '#4ADE80',
    border: '#22C55E',
  },
  inProgress: {
    background: 'rgba(34, 197, 94, 0.25)',
    foreground: '#22C55E',
    border: '#16A34A',
  },
  completed: {
    background: 'rgba(22, 163, 74, 0.30)',
    foreground: '#FFFFFF',
    border: '#16A34A',
  },
} as const;

/** Progress bar segment fill (index 1–3 match Accepted / On the way / Done). */
export const ORDER_SEGMENT_BAR_COLORS: Record<0 | 1 | 2 | 3, string> = {
  0: '#8B9A88',
  1: '#4ADE80',
  2: '#22C55E',
  3: '#FFFFFF',
};
