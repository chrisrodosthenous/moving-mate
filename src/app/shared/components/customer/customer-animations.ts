import { animate, query, stagger, style, transition, trigger } from '@angular/animations';

/** Staggered entrance for order cards in a list. */
export const customerOrderListStagger = trigger('customerOrderListStagger', [
  transition('* => *', [
    query(
      ':enter',
      [
        style({ opacity: 0, transform: 'translateY(12px)' }),
        stagger(55, [
          animate(
            '280ms cubic-bezier(0.22, 1, 0.36, 1)',
            style({ opacity: 1, transform: 'none' }),
          ),
        ]),
      ],
      { optional: true },
    ),
  ]),
]);

/** Expand / collapse extra order details. */
export const customerOrderExpand = trigger('customerOrderExpand', [
  transition(':enter', [
    style({ height: 0, opacity: 0, overflow: 'hidden' }),
    animate('220ms ease-out', style({ height: '*', opacity: 1 })),
  ]),
  transition(':leave', [
    style({ overflow: 'hidden' }),
    animate('180ms ease-in', style({ height: 0, opacity: 0 })),
  ]),
]);

/** Success checkmark after booking (scale + fade). */
export const customerBookingSuccess = trigger('customerBookingSuccess', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.6)' }),
    animate(
      '420ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      style({ opacity: 1, transform: 'scale(1)' }),
    ),
  ]),
]);

export const customerShellTabTransition = trigger('customerShellTab', [
  transition('* => *', [
    style({ opacity: 0, transform: 'translateY(8px)' }),
    animate('200ms ease-out', style({ opacity: 1, transform: 'none' })),
  ]),
]);
