import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { APP_ENTRY_PATH, REGISTER_PATH } from '../../shared/brand';

interface InstallStep {
  title: string;
  text: string;
}

interface Perk {
  icon: string;
  title: string;
  text: string;
}

@Component({
  selector: 'web-download',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule, PageHeroComponent],
  template: `
    <web-page-hero
      eyebrow="Get the app"
      title="Install Moving Mate on your phone"
      subtitle="Moving Mate is a Progressive Web App — no app store needed. Add it to your home screen and it works just like a native app, with push notifications and offline support."
    />

    <section class="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div class="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center sm:p-10">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
          <lucide-icon name="smartphone" [size]="28" aria-hidden="true" />
        </div>
        <h2 class="mt-5 text-2xl font-bold">Open the app in your browser</h2>
        <p class="mx-auto mt-3 max-w-xl text-muted-foreground">
          Visit the app, then follow the steps below for your device to install it.
        </p>
        <a
          [routerLink]="appEntryPath"
          class="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-btn-primary transition hover:bg-brand-green-dark"
        >
          Open Moving Mate
          <lucide-icon name="arrow-right" [size]="18" aria-hidden="true" />
        </a>
      </div>

      <div class="mt-12 grid gap-6 lg:grid-cols-2">
        <!-- iOS -->
        <div class="rounded-2xl border border-border/40 bg-card/60 p-6">
          <h3 class="flex items-center gap-2 text-lg font-semibold">
            <lucide-icon name="share" [size]="20" class="text-primary" aria-hidden="true" />
            On iPhone &amp; iPad (Safari)
          </h3>
          <ol class="mt-5 space-y-4">
            @for (step of iosSteps; track step.title; let i = $index) {
              <li class="flex items-start gap-3">
                <span
                  class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                >
                  {{ i + 1 }}
                </span>
                <div>
                  <p class="text-sm font-medium text-foreground">{{ step.title }}</p>
                  <p class="mt-0.5 text-sm text-muted-foreground">{{ step.text }}</p>
                </div>
              </li>
            }
          </ol>
        </div>

        <!-- Android -->
        <div class="rounded-2xl border border-border/40 bg-card/60 p-6">
          <h3 class="flex items-center gap-2 text-lg font-semibold">
            <lucide-icon name="square-plus" [size]="20" class="text-primary" aria-hidden="true" />
            On Android (Chrome)
          </h3>
          <ol class="mt-5 space-y-4">
            @for (step of androidSteps; track step.title; let i = $index) {
              <li class="flex items-start gap-3">
                <span
                  class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                >
                  {{ i + 1 }}
                </span>
                <div>
                  <p class="text-sm font-medium text-foreground">{{ step.title }}</p>
                  <p class="mt-0.5 text-sm text-muted-foreground">{{ step.text }}</p>
                </div>
              </li>
            }
          </ol>
        </div>
      </div>

      <!-- Why PWA -->
      <div class="mt-12 grid gap-6 sm:grid-cols-3">
        @for (perk of perks; track perk.title) {
          <div class="rounded-2xl border border-border/40 bg-card/60 p-6 text-center">
            <div class="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <lucide-icon [name]="perk.icon" [size]="22" aria-hidden="true" />
            </div>
            <h3 class="mt-4 font-semibold">{{ perk.title }}</h3>
            <p class="mt-2 text-sm text-muted-foreground">{{ perk.text }}</p>
          </div>
        }
      </div>

      <p class="mt-10 text-center text-sm text-muted-foreground">
        New to Moving Mate?
        <a [routerLink]="registerPath" class="font-semibold text-primary hover:text-brand-green-light">
          Create a free account
        </a>
        and install the app to get moving.
      </p>
    </section>
  `,
})
export class DownloadComponent {
  readonly appEntryPath = APP_ENTRY_PATH;
  readonly registerPath = REGISTER_PATH;

  readonly iosSteps: InstallStep[] = [
    { title: 'Open in Safari', text: 'Visit the Moving Mate app link in the Safari browser.' },
    { title: 'Tap the Share button', text: 'It is the square icon with an arrow at the bottom of the screen.' },
    { title: 'Add to Home Screen', text: 'Scroll down and choose "Add to Home Screen", then tap Add.' },
  ];

  readonly androidSteps: InstallStep[] = [
    { title: 'Open in Chrome', text: 'Visit the Moving Mate app link in the Chrome browser.' },
    { title: 'Open the menu', text: 'Tap the three-dot menu in the top right, or the install prompt.' },
    { title: 'Install app', text: 'Choose "Install app" or "Add to Home screen" and confirm.' },
  ];

  readonly perks: Perk[] = [
    { icon: 'zap', title: 'Fast & lightweight', text: 'Installs in seconds and uses far less storage than a native app.' },
    { icon: 'bell', title: 'Push notifications', text: 'Get real-time updates about your move, right on your device.' },
    { icon: 'shield-check', title: 'Always up to date', text: 'The app updates automatically — no store downloads required.' },
  ];
}
