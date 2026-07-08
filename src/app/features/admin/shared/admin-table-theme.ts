/** Shared admin data-table layout — logo green palette. */
export const ADMIN_TABLE = {
  container:
    'rounded-2xl overflow-hidden border border-border/30 bg-card/85 backdrop-blur-sm shadow-surface',
  scrollWrap:
    'admin-table-scroll relative -mx-4 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0',
  scrollHint: 'admin-table-scroll-hint',
  search:
    'w-full min-w-0 max-w-full rounded-lg border border-border/50 bg-input/70 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary focus:shadow-input-focus sm:max-w-md min-h-[44px]',
  thead: 'bg-muted/80 text-foreground text-left font-semibold',
  th: 'px-3 py-3 text-xs uppercase tracking-wide text-primary sm:px-4',
  tbody: 'divide-y divide-border/20',
  tr: 'border-b border-border/15 text-foreground transition-colors hover:bg-secondary/15',
  td: 'px-3 py-3 text-sm text-foreground sm:px-4',
  actionBtn:
    'inline-flex min-h-[44px] items-center justify-center px-3 text-xs border-accent/30 text-text hover:bg-accent/15',
} as const;

export type AdminTableBadgeTone = 'active' | 'pending' | 'cancelled' | 'muted';

export function adminTableBadgeClass(tone: AdminTableBadgeTone): string {
  const base = 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold';
  switch (tone) {
    case 'active':
      return `${base} border border-primary/40 bg-primary/20 text-primary`;
    case 'pending':
      return `${base} border border-primary/25 bg-warning/15 text-foreground`;
    case 'cancelled':
      return `${base} border border-primary/30 bg-destructive text-destructive-foreground`;
    case 'muted':
      return `${base} border border-border/40 bg-muted/25 text-muted-foreground`;
  }
}
