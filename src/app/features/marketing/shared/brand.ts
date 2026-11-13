/** Internal in-app auth routes (integrated into the main Moving Mate app). */
export const LOGIN_PATH = '/login';
export const REGISTER_PATH = '/register';

/** Where the "Open the app" CTA sends visitors (guestGuard forwards logged-in users to their dashboard). */
export const APP_ENTRY_PATH = '/login';

/** Primary marketing site navigation. */
export interface NavLink {
  label: string;
  path: string;
}

export const NAV_LINKS: NavLink[] = [
  { label: 'Features', path: '/features' },
  { label: 'How it works', path: '/how-it-works' },
  { label: 'About', path: '/about' },
  { label: 'Get the app', path: '/download' },
  { label: 'Contact', path: '/contact' },
];

/** Public legal documents (marketing footer + register). */
export const LEGAL_LINKS: NavLink[] = [
  { label: 'Privacy Policy', path: '/privacy' },
  { label: 'Terms of Service', path: '/terms' },
  { label: 'Cookie notice', path: '/cookies' },
];
