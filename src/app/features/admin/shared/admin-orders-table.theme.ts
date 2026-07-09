/** Admin orders data table — aligned with app design tokens. */

export const ADMIN_ORDERS_TABLE = {
  container: 'rounded-xl overflow-hidden border border-border/30 bg-card/85 shadow-sm',
  scrollWrap:
    'admin-table-scroll relative -mx-4 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0',
  scrollHint: 'admin-table-scroll-hint',
  search:
    'w-full min-w-0 max-w-full rounded-lg border border-border/30 bg-secondary/45 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 sm:max-w-md min-h-[44px]',
  thead: 'bg-muted/80 text-left',
  th: 'px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:px-4 sm:text-xs',
  tbody: '',
  trBase: 'border-b border-border/20 transition-colors duration-150 hover:bg-secondary/30',
  trEven: 'bg-card/40',
  trOdd: 'bg-card/20',
  td: 'px-3 py-3 text-sm sm:px-4',
  tdBody: 'text-foreground',
  tdPrimary: 'text-foreground font-medium',
  actionBtn:
    'inline-flex min-h-[44px] items-center justify-center px-3 text-xs border-border/30 bg-secondary/45 text-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
  loadMoreBar: 'flex justify-center border-t border-border/20 px-4 py-4',
} as const;

export const ADMIN_ORDERS_COL_COUNT = 11;
