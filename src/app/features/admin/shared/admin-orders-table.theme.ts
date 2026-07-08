/** Electric Blue & Slate Navy — admin Orders data table only. */

export const ADMIN_ORDERS_TABLE = {
  container:
    'rounded-xl overflow-hidden border border-[#49769F]/30 bg-[#0A4174] shadow-[0_4px_20px_rgba(0,18,36,0.3)]',
  scrollWrap:
    'admin-table-scroll relative -mx-4 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0',
  scrollHint: 'admin-table-scroll-hint',
  search:
    'w-full min-w-0 max-w-full rounded-lg border border-[#49769F]/40 bg-[#001224] px-3 py-2.5 text-sm text-[#BDD8E9] placeholder:text-[#BDD8E9]/45 outline-none transition focus:border-[#7BBDE8] focus:ring-2 focus:ring-[#7BBDE8]/30 sm:max-w-md min-h-[44px]',
  thead: 'bg-[#001224] text-left',
  th: 'px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-white sm:px-4 sm:text-xs',
  tbody: '',
  trBase:
    'border-b border-[#49769F]/20 transition-colors duration-150 hover:bg-[#49769F]/30',
  trEven: 'bg-[#0A4174]/40',
  trOdd: 'bg-[#0A4174]/10',
  td: 'px-3 py-3 text-sm sm:px-4',
  tdBody: 'text-[#BDD8E9]',
  tdPrimary: 'text-white',
  actionBtn:
    'inline-flex min-h-[44px] items-center justify-center px-3 text-xs border-[#49769F]/40 bg-[#001224]/60 text-[#BDD8E9] hover:border-[#7BBDE8]/50 hover:bg-[#7BBDE8]/10 hover:text-white',
  loadMoreBar: 'flex justify-center border-t border-[#49769F]/25 px-4 py-4',
} as const;

export const ADMIN_ORDERS_COL_COUNT = 11;
