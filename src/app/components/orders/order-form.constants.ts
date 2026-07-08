/** Floor options shared by pickup and destination dropdowns. */
export const ORDER_FLOOR_OPTIONS = [
  { value: '0', label: 'Ground Floor' },
  { value: '1', label: '1st' },
  { value: '2', label: '2nd' },
  { value: '3', label: '3rd' },
  { value: '4', label: '4th+' },
] as const;

export type {
  OrderLaborRequired,
  OrderLogistics,
  OrderLogisticsPartial,
  OrderVehicleType,
} from '../../core/models/order.model';

export { DEFAULT_ORDER_LOGISTICS } from '../../core/models/order.model';

/** Shared select styling — matches app semantic tokens. */
export const ORDER_SELECT_CLASS =
  'w-full max-w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 md:px-4 md:py-2.5';

export const ORDER_LABEL_CLASS =
  'mb-1 block text-[10px] font-medium text-card-foreground xs:text-xs md:mb-2 md:text-sm';

export const ORDER_LABEL_SUB_CLASS =
  'mb-1 block text-[10px] text-muted-foreground xs:text-xs md:text-xs';

export const ORDER_MAP_BTN_ACTIVE =
  'ring-2 ring-primary/80 ring-offset-1 border-primary/30 bg-primary/10';

export const ORDER_MAP_BTN_IDLE =
  'border-border/40 bg-card/85 backdrop-blur-sm hover:bg-secondary/20';
