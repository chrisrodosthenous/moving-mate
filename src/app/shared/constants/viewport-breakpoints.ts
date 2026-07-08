/** Side-by-side route map + list (desktop / large tablet landscape). */
export const ROUTE_PREVIEW_SPLIT_BREAKPOINT = '(min-width: 1024px)';

export function routePreviewSplitInitial(): boolean {
  return typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia(ROUTE_PREVIEW_SPLIT_BREAKPOINT).matches
    : false;
}
