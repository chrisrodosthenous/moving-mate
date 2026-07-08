import { animate, query, stagger, style, transition, trigger } from '@angular/animations';

/** Admin notify section: tab panel enter (push vs email). */
export const notifyPanelEnter = trigger('notifyPanelEnter', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(10px)' }),
    animate(
      '260ms cubic-bezier(0.22, 1, 0.36, 1)',
      style({ opacity: 1, transform: 'none' }),
    ),
  ]),
]);

/** Slide-in stagger for Push Deep-Link Tester category cards. */
export const slideInTesterCards = trigger('slideInTesterCards', [
  transition(':enter', [
    query(
      '.tester-card',
      [
        style({ opacity: 0, transform: 'translateX(-18px)' }),
        stagger(85, [
          animate(
            '380ms cubic-bezier(0.22, 1, 0.36, 1)',
            style({ opacity: 1, transform: 'none' }),
          ),
        ]),
      ],
      { optional: true },
    ),
  ]),
]);

/** Notification settings page: staggered enter for email / push / simulator sections. */
export const notificationSettingsSections = trigger('notificationSettingsSections', [
  transition(':enter', [
    query(
      '.settings-section',
      [
        style({ opacity: 0, transform: 'translateY(14px)' }),
        stagger(100, [
          animate(
            '320ms cubic-bezier(0.22, 1, 0.36, 1)',
            style({ opacity: 1, transform: 'none' }),
          ),
        ]),
      ],
      { optional: true },
    ),
  ]),
]);
