import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { REGISTER_PATH } from '../../shared/brand';

interface Feature {
  icon: string;
  title: string;
  text: string;
}

interface Step {
  n: string;
  title: string;
  text: string;
}

@Component({
  selector: 'web-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule],
  template: `
    <!-- Hero -->
    <section class="relative overflow-hidden">
      <div
        class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(34,197,94,0.18),transparent)]"
        aria-hidden="true"
      ></div>
      <div class="mx-auto w-full max-w-7xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24 lg:px-8">
        <div class="mx-auto max-w-3xl text-center">
          <span
            class="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary"
          >
            <lucide-icon name="zap" [size]="14" aria-hidden="true" />
            Moving made effortless
          </span>
          <h1 class="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Move smarter.<br />
            <span class="text-primary">Book trusted movers</span> in minutes.
          </h1>
          <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Moving Mate connects you with verified drivers to move your home or cargo. Get instant
            pricing, live tracking and secure payments — all in one app.
          </p>
          <div class="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              [routerLink]="registerPath"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-btn-primary transition hover:bg-brand-green-dark sm:w-auto"
            >
              Get started free
              <lucide-icon name="arrow-right" [size]="18" aria-hidden="true" />
            </a>
            <a
              routerLink="/how-it-works"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 px-7 py-3.5 text-base font-semibold text-foreground transition hover:bg-secondary/30 sm:w-auto"
            >
              See how it works
            </a>
          </div>
          <p class="mt-5 text-sm text-muted-foreground">No subscription · Pay per move · Cancel anytime</p>
        </div>
      </div>
    </section>

    <!-- Stats -->
    <section class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-2 gap-4 rounded-2xl border border-border/40 bg-card/60 p-6 sm:grid-cols-4 sm:p-8">
        @for (stat of stats; track stat.label) {
          <div class="text-center">
            <p class="text-3xl font-extrabold tabular-nums text-primary sm:text-4xl">{{ stat.value }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ stat.label }}</p>
          </div>
        }
      </div>
    </section>

    <!-- Value props -->
    <section class="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to move</h2>
        <p class="mt-4 text-lg text-muted-foreground">
          From a single box to a full home — Moving Mate has the right vehicle and the right driver.
        </p>
      </div>
      <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        @for (f of features; track f.title) {
          <div
            class="group rounded-2xl border border-border/40 bg-card/60 p-6 transition hover:border-primary/40 hover:shadow-card-elevated"
          >
            <div class="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <lucide-icon [name]="f.icon" [size]="24" aria-hidden="true" />
            </div>
            <h3 class="mt-5 text-lg font-semibold">{{ f.title }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ f.text }}</p>
          </div>
        }
      </div>
    </section>

    <!-- How it works preview -->
    <section class="bg-popover/40 py-16 sm:py-20">
      <div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">Three steps to a done deal</h2>
          <p class="mt-4 text-lg text-muted-foreground">Booking a move has never been this simple.</p>
        </div>
        <div class="mt-12 grid gap-6 md:grid-cols-3">
          @for (step of steps; track step.n) {
            <div class="relative rounded-2xl border border-border/40 bg-card/60 p-6">
              <span
                class="grid h-10 w-10 place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground"
              >
                {{ step.n }}
              </span>
              <h3 class="mt-4 text-lg font-semibold">{{ step.title }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ step.text }}</p>
            </div>
          }
        </div>
        <div class="mt-10 text-center">
          <a
            routerLink="/how-it-works"
            class="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-brand-green-light"
          >
            Learn more about how it works
            <lucide-icon name="arrow-right" [size]="16" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div
        class="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/60 to-card/60 p-8 text-center sm:p-14"
      >
        <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">Ready to move with Moving Mate?</h2>
        <p class="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Create your free account and get an instant quote for your next move.
        </p>
        <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            [routerLink]="registerPath"
            class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-btn-primary transition hover:bg-brand-green-dark sm:w-auto"
          >
            Get started free
            <lucide-icon name="arrow-right" [size]="18" aria-hidden="true" />
          </a>
          <a
            routerLink="/download"
            class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 px-7 py-3.5 text-base font-semibold text-foreground transition hover:bg-secondary/30 sm:w-auto"
          >
            <lucide-icon name="smartphone" [size]="18" aria-hidden="true" />
            Get the app
          </a>
        </div>
      </div>
    </section>
  `,
})
export class HomeComponent {
  readonly registerPath = REGISTER_PATH;

  readonly stats = [
    { value: '4', label: 'Vehicle sizes' },
    { value: '24/7', label: 'Live tracking' },
    { value: '100%', label: 'Verified drivers' },
    { value: '€10+', label: 'Transparent pricing' },
  ];

  readonly features: Feature[] = [
    {
      icon: 'zap',
      title: 'Instant pricing',
      text: 'Transparent, upfront quotes based on distance, vehicle and add-ons. No surprises at the door.',
    },
    {
      icon: 'shield-check',
      title: 'Verified drivers',
      text: 'Every driver is identity- and vehicle-verified by our team before they can accept jobs.',
    },
    {
      icon: 'map-pin',
      title: 'Live tracking',
      text: 'Follow your driver in real time from pickup to drop-off with accurate ETAs.',
    },
    {
      icon: 'credit-card',
      title: 'Secure payments',
      text: 'Pay safely in-app. Funds are only released to the driver once your move is complete.',
    },
    {
      icon: 'package',
      title: 'Any load size',
      text: 'From a pickup truck to a full moving truck — choose the vehicle that fits your move.',
    },
    {
      icon: 'message-square',
      title: 'In-app chat',
      text: 'Coordinate details directly with your driver through built-in secure messaging.',
    },
  ];

  readonly steps: Step[] = [
    {
      n: '1',
      title: 'Tell us about your move',
      text: 'Enter pickup and drop-off, choose a vehicle and any extras like loading help.',
    },
    {
      n: '2',
      title: 'Get matched instantly',
      text: 'See your upfront price and a nearby verified driver accepts your job.',
    },
    {
      n: '3',
      title: 'Track and relax',
      text: 'Follow the move live and pay securely once everything arrives safely.',
    },
  ];
}
