import { animate, style, transition, trigger } from '@angular/animations';

/** Fires when the tabAnim counter changes (driver shell) for a short cross-fade + slide. */
export const driverShellTabTransition = trigger('driverShellTab', [
  transition('* => *', [
    style({ opacity: 0, transform: 'translateY(10px)' }),
    animate('220ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'none' })),
  ]),
]);
