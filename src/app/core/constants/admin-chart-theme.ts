/** Shared chart palette — logo green scale only */
export const CHART_THEME = {
  primary: '#22C55E',
  accent: '#16A34A',
  secondary: '#4ADE80',
  error: '#1A3D2A',
  hover: '#4ADE80',
  grid: 'rgba(36, 48, 68, 0.9)',
  gridDriver: 'rgba(36, 48, 68, 0.55)',
  label: '#F4F7FB',
  labelMuted: '#93A4B8',
  track: 'rgba(34, 197, 94, 0.16)',
} as const;

/** @deprecated Use {@link CHART_THEME} */
export const ADMIN_CHART = CHART_THEME;

export const ADMIN_CHART_SLICE_COLORS = [
  CHART_THEME.primary,
  CHART_THEME.accent,
  CHART_THEME.secondary,
  '#318556',
  '#052E14',
] as const;
