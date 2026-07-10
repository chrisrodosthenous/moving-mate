import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { customerGuard } from './core/guards/customer.guard';
import { driverGuard } from './core/guards/driver.guard';
import { adminGuard } from './core/guards/admin.guard';
import { redirectDriverFromMyOrdersGuard } from './core/guards/redirect-driver-from-my-orders.guard';
import { driverStatusRefreshGuard } from './core/guards/driver-status-refresh.guard';

export const routes: Routes = [
  /* ── Public marketing site (integrated). '/' is the landing page. ───── */
  {
    path: '',
    loadComponent: () =>
      import('./features/marketing/marketing-shell.component').then(m => m.MarketingShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Moving Mate — Move smarter. Book trusted movers in minutes.',
        loadComponent: () =>
          import('./features/marketing/pages/home/home.component').then(m => m.HomeComponent),
      },
      {
        path: 'features',
        title: 'Features — Moving Mate',
        loadComponent: () =>
          import('./features/marketing/pages/features/features.component').then(m => m.FeaturesComponent),
      },
      {
        path: 'how-it-works',
        title: 'How it works — Moving Mate',
        loadComponent: () =>
          import('./features/marketing/pages/how-it-works/how-it-works.component').then(m => m.HowItWorksComponent),
      },
      {
        path: 'about',
        title: 'About us — Moving Mate',
        loadComponent: () =>
          import('./features/marketing/pages/about/about.component').then(m => m.AboutComponent),
      },
      {
        path: 'contact',
        title: 'Contact us — Moving Mate',
        loadComponent: () =>
          import('./features/marketing/pages/contact/contact.component').then(m => m.ContactComponent),
      },
      {
        path: 'download',
        title: 'Get the app — Moving Mate',
        loadComponent: () =>
          import('./features/marketing/pages/download/download.component').then(m => m.DownloadComponent),
      },
    ],
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    data: { pageTitle: 'Dashboard' },
    canActivate: [authGuard],
  },
  {
    path: 'profile',
    data: { pageTitle: 'Profile' },
    loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'map',
    loadComponent: () => import('./features/map/map-view/map-view.component').then(m => m.MapViewComponent),
    canActivate: [authGuard, customerGuard],
  },
  {
    path: 'customer',
    loadComponent: () => import('./shared/components/customer/customer-shell.component').then(m => m.CustomerShellComponent),
    canActivate: [authGuard, customerGuard],
    children: [
      /* React: /customer index → /customer/dashboard (stats home inside Layout) */
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        data: { pageTitle: 'Dashboard' },
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      /* React Layout URLs → Angular routes */
      { path: 'new-order', redirectTo: 'book', pathMatch: 'full' },
      { path: 'my-orders', redirectTo: 'orders', pathMatch: 'full' },
      { path: 'profile', redirectTo: '/profile', pathMatch: 'full' },
      {
        path: 'book',
        data: { pageTitle: 'New Order', shellFullBleed: true },
        loadComponent: () => import('./features/orders/create-order/create-order.component').then(m => m.CreateOrderComponent),
      },
      {
        path: 'orders/:orderId/checkout',
        data: { pageTitle: 'Checkout' },
        loadComponent: () =>
          import('./features/orders/order-checkout/order-checkout.component').then(
            (m) => m.OrderCheckoutComponent,
          ),
      },
      {
        path: 'orders/:orderId',
        data: { pageTitle: 'Order details' },
        loadComponent: () =>
          import('./features/customer/customer-order-details/customer-order-details.component').then(
            (m) => m.CustomerOrderDetailsComponent,
          ),
      },
      {
        path: 'orders',
        /** Full-bleed outlet + `main` overflow-hidden so split map/list matches driver Available / My trips (no shell scroll). */
        data: { pageTitle: 'My Orders', shellFullBleed: true },
        loadComponent: () => import('./features/orders/my-orders/my-orders.component').then(m => m.MyOrdersComponent),
      },
    ],
  },
  { path: 'orders/create', redirectTo: 'customer/book', pathMatch: 'full' },
  {
    path: 'driver',
    loadComponent: () => import('./shared/components/driver/driver-shell.component').then(m => m.DriverShellComponent),
    canActivate: [authGuard, driverGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        data: { pageTitle: 'Dashboard' },
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      { path: 'my-tasks', redirectTo: 'tasks', pathMatch: 'full' },
      { path: 'profile', redirectTo: '/profile', pathMatch: 'full' },
      {
        path: 'available',
        data: { pageTitle: 'Available jobs' },
        canActivate: [driverStatusRefreshGuard],
        loadComponent: () =>
          import('./shared/components/driver/driver-available-orders.component').then(m => m.DriverAvailableOrdersComponent),
      },
      {
        path: 'active/:orderId',
        data: { pageTitle: 'Active delivery' },
        canActivate: [driverStatusRefreshGuard],
        loadComponent: () =>
          import('./features/driver/driver-active-delivery/driver-active-delivery.component').then(
            (m) => m.DriverActiveDeliveryComponent,
          ),
      },
      {
        path: 'tasks',
        data: { pageTitle: 'My trips' },
        canActivate: [driverStatusRefreshGuard],
        loadComponent: () =>
          import('./shared/components/driver/driver-my-tasks.component').then(m => m.DriverMyTasksComponent),
      },
      {
        path: 'job/:orderId',
        data: { pageTitle: 'Job details' },
        canActivate: [driverStatusRefreshGuard],
        loadComponent: () =>
          import('./features/driver/driver-job-detail/driver-job-detail.component').then(m => m.DriverJobDetailComponent),
      },
    ],
  },
  { path: 'orders/available', redirectTo: 'driver/available', pathMatch: 'full' },
  {
    path: 'orders/my-orders',
    data: { pageTitle: 'My Orders' },
    loadComponent: () => import('./features/orders/my-orders/my-orders.component').then(m => m.MyOrdersComponent),
    canActivate: [authGuard, redirectDriverFromMyOrdersGuard],
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./shared/components/admin/admin-shell.component').then((m) => m.AdminShellComponent),
    canActivate: [authGuard, adminGuard],
    children: [
      {
        path: '',
        data: { pageTitle: 'Admin dashboard' },
        loadComponent: () =>
          import('./features/admin/admin-dashboard/admin-dashboard.component').then(
            (m) => m.AdminDashboardComponent,
          ),
      },
      {
        path: 'settings/notifications',
        data: { pageTitle: 'Notification settings' },
        loadComponent: () =>
          import('./features/admin/notification-settings-page/notification-settings-page.component').then(
            (m) => m.NotificationSettingsPageComponent,
          ),
      },
    ],
  },
  { path: 'admin/dashboard', redirectTo: 'admin', pathMatch: 'full' },
  {
    path: 'rate-driver/:orderId',
    loadComponent: () => import('./features/orders/rate-driver-page/rate-driver-page.component').then(m => m.RateDriverPageComponent),
    canActivate: [authGuard, customerGuard],
  },

  /* ── Deep-link redirects (match backend push URL patterns) ──────────── */
  {
    path: 'my-orders',
    loadComponent: () =>
      import('./features/orders/my-orders-redirect/my-orders-redirect.component').then(m => m.MyOrdersRedirectComponent),
    canActivate: [authGuard],
  },
  { path: 'available-orders', redirectTo: 'driver/available', pathMatch: 'full' },
  /** Deep links: role-aware destination via `MyOrdersRedirectComponent` (`/my-orders` route). */
  { path: 'chat/:id', redirectTo: 'my-orders', pathMatch: 'full' },
  { path: 'admin/verify-drivers', redirectTo: 'admin', pathMatch: 'full' },

  /* ── Catch-all: role dashboard if logged in, else login (React parity) ─ */
  {
    path: '**',
    loadComponent: () =>
      import('./core/routing/catch-all-redirect.component').then(m => m.CatchAllRedirectComponent),
  },
];
