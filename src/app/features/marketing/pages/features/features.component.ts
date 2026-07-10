import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { REGISTER_PATH } from '../../shared/brand';

interface Feature {
  icon: string;
  title: string;
  text: string;
}

@Component({
  selector: 'web-features',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule, PageHeroComponent],
  template: `
    <web-page-hero
      eyebrow="Features"
      title="Built for stress-free moving"
      subtitle="Every part of Moving Mate is designed to make moving faster, safer and more transparent — for customers and drivers alike."
    />

    <section class="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        @for (f of features; track f.title) {
          <div
            class="rounded-2xl border border-border/40 bg-card/60 p-6 transition hover:border-primary/40 hover:shadow-card-elevated"
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

    <!-- Split: customers vs drivers -->
    <section class="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      <div class="grid gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-border/40 bg-card/60 p-8">
          <h3 class="text-xl font-bold text-primary">For customers</h3>
          <ul class="mt-5 space-y-3">
            @for (item of customerPoints; track item) {
              <li class="flex items-start gap-3 text-sm text-muted-foreground">
                <lucide-icon name="check" [size]="18" class="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <span>{{ item }}</span>
              </li>
            }
          </ul>
        </div>
        <div class="rounded-2xl border border-border/40 bg-card/60 p-8">
          <h3 class="text-xl font-bold text-primary">For drivers</h3>
          <ul class="mt-5 space-y-3">
            @for (item of driverPoints; track item) {
              <li class="flex items-start gap-3 text-sm text-muted-foreground">
                <lucide-icon name="check" [size]="18" class="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <span>{{ item }}</span>
              </li>
            }
          </ul>
        </div>
      </div>
    </section>

    <section class="mx-auto w-full max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <a
        [routerLink]="registerPath"
        class="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-btn-primary transition hover:bg-brand-green-dark"
      >
        Create your free account
        <lucide-icon name="arrow-right" [size]="18" aria-hidden="true" />
      </a>
      <p class="mt-4 text-sm text-muted-foreground">
        Prefer to see it first?
        <a routerLink="/how-it-works" class="font-semibold text-primary hover:text-brand-green-light">
          See how it works
        </a>
      </p>
    </section>
  `,
})
export class FeaturesComponent {
  readonly registerPath = REGISTER_PATH;

  readonly features: Feature[] = [
    { icon: 'zap', title: 'Instant, transparent pricing', text: 'A clear quote based on distance, vehicle tier and add-ons before you book.' },
    { icon: 'shield-check', title: 'Verified, trusted drivers', text: 'Identity and vehicle checks are required before any driver can accept jobs.' },
    { icon: 'map-pin', title: 'Real-time tracking', text: 'Watch your move progress live with accurate pickup and delivery ETAs.' },
    { icon: 'credit-card', title: 'Secure in-app payments', text: 'Funds are authorised up front and released only when the job is complete.' },
    { icon: 'package', title: 'Right-sized vehicles', text: 'Pickup, minivan, van or truck — pick the vehicle that matches your load.' },
    { icon: 'message-square', title: 'Direct messaging', text: 'Coordinate access, floors and details with your driver through secure chat.' },
    { icon: 'bell', title: 'Smart notifications', text: 'Stay informed at every step with email and push updates you control.' },
    { icon: 'route', title: 'Optimised routes', text: 'Distance and pricing are calculated on real driving routes, not straight lines.' },
    { icon: 'star', title: 'Ratings & reviews', text: 'Rate each move so the community keeps quality high for everyone.' },
  ];

  readonly customerPoints = [
    'Book a move in minutes with an upfront price',
    'Choose extra loading help and floor/elevator options',
    'Track your driver live and chat in-app',
    'Pay securely — released only after delivery',
    'Rate your driver and reorder in a tap',
  ];

  readonly driverPoints = [
    'Get matched with nearby jobs that fit your vehicle',
    'See clear earnings before you accept',
    'Fair 80/20 payout split on completed jobs',
    'Manage tasks, navigation and status in one place',
    'Build your reputation with customer ratings',
  ];
}
