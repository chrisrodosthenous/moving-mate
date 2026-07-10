import {
  APP_INITIALIZER,
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  importProvidersFrom,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { AppGlobalErrorHandler } from './core/error/app-global-error.handler';
import { routes } from './app.routes';
import { driverReducer, driverFeatureKey } from './features/driver/state/driver.reducer';
import { DriverEffects } from './features/driver/state/driver.effects';
import { customerReducer, customerFeatureKey } from './features/customer/state/customer.reducer';
import { CustomerEffects } from './features/customer/state/customer.effects';
import {
  adminNotificationsReducer,
  adminNotificationsFeatureKey,
} from './features/admin/state/admin-notifications.reducer';
import { AdminNotificationsEffects } from './features/admin/state/admin-notifications.effects';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { provideServiceWorker } from '@angular/service-worker';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { httpErrorInterceptor } from './core/interceptors/http-error.interceptor';
import { transientRetryInterceptor } from './core/interceptors/transient-retry.interceptor';
import { GoogleMapsLoaderService } from './core/services/google-maps-loader.service';
import {
  LucideAngularModule,
  MapPlus,
  MapPin,
  History,
  AlertTriangle,
  ArrowUpDown,
  ArrowRight,
  User,
  Users,
  Truck,
  Container,
  CircleCheck,
  Check,
  LogOut,
  Home,
  Clock,
  ShieldCheck,
  Bell,
  Loader2,
  Send,
  RotateCcw,
  Mail,
  Settings2,
  ToggleLeft,
  ToggleRight,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Info,
  Star,
  Zap,
  CreditCard,
  Package,
  MessageSquare,
  Route,
  Smartphone,
  Share,
  SquarePlus,
  Heart,
} from 'lucide-angular';

export function googleMapsAppInitializer(loader: GoogleMapsLoaderService): () => Promise<boolean> {
  return () => loader.ensureLoaded();
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: ErrorHandler, useClass: AppGlobalErrorHandler },
    {
      provide: APP_INITIALIZER,
      useFactory: googleMapsAppInitializer,
      deps: [GoogleMapsLoaderService],
      multi: true,
    },
    provideBrowserGlobalErrorListeners(),
    provideAnimations(),
    provideHttpClient(
      withInterceptors([httpErrorInterceptor, authInterceptor, transientRetryInterceptor]),
    ),
    provideStore({
      [driverFeatureKey]: driverReducer,
      [customerFeatureKey]: customerReducer,
      [adminNotificationsFeatureKey]: adminNotificationsReducer,
    }),
    provideEffects(DriverEffects, CustomerEffects, AdminNotificationsEffects),
    provideStoreDevtools({
      maxAge: 25,
      logOnly: !isDevMode(),
      connectInZone: true,
    }),
    provideRouter(routes),
    provideCharts(withDefaultRegisterables()),
    importProvidersFrom(
      LucideAngularModule.pick({
        MapPlus,
        MapPin,
        History,
        AlertTriangle,
        ArrowUpDown,
        ArrowRight,
        User,
        Users,
        Truck,
        Container,
        CircleCheck,
        Check,
        LogOut,
        Home,
        Clock,
        ShieldCheck,
        Bell,
        Loader2,
        Send,
        RotateCcw,
        Mail,
        Settings2,
        ToggleLeft,
        ToggleRight,
        Menu,
        PanelLeftClose,
        PanelLeftOpen,
        X,
        Info,
        Star,
        Zap,
        CreditCard,
        Package,
        MessageSquare,
        Route,
        Smartphone,
        Share,
        SquarePlus,
        Heart,
      }),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
