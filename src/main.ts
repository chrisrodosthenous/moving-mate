import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

/** Maps bootstrap is handled by {@link GoogleMapsLoaderService} + `APP_INITIALIZER` in `app.config.ts`. */
bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
