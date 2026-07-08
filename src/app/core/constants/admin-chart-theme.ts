/** Shared chart palette — logo green scale only */
export const CHART_THEME = {
  primary: '#22C55E',
  accent: '#16A34A',
  secondary: '#4ADE80',
  error: '#1A3D2A',
  hover: '#4ADE80',
  grid: 'rgba(36, 51, 40, 0.45)',
  gridDriver: 'rgba(36, 51, 40, 0.25)',
  label: '#FFFFFF',
  labelMuted: '#8B9A88',
  track: 'rgba(34, 197, 94, 0.12)',
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
