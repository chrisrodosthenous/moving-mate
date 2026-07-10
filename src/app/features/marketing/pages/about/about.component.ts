import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PageHeroComponent } from '../../shared/page-hero.component';

interface Value {
  icon: string;
  title: string;
  text: string;
}

@Component({
  selector: 'web-about',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule, PageHeroComponent],
  template: `
    <web-page-hero
      eyebrow="About us"
      title="We're making moving simple and fair"
      subtitle="Moving Mate was built to take the stress, guesswork and hidden costs out of moving — for everyone involved."
    />

    <section class="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div class="space-y-6 text-lg leading-relaxed text-muted-foreground">
        <p>
          Moving is one of life's most stressful events. Finding a reliable mover, getting a fair
          price and knowing your belongings are in safe hands shouldn't be part of the stress.
        </p>
        <p>
          <span class="font-semibold text-foreground">Moving Mate</span> connects people who need to
          move with trusted, verified drivers — powered by instant pricing, live tracking and secure
          payments. No phone tag, no vague quotes, no surprises.
        </p>
        <p>
          We believe in fairness on both sides of the move: transparent prices for customers and a
          fair payout for the drivers who do the hard work.
        </p>
      </div>
    </section>

    <section class="bg-popover/40 py-16 sm:py-20">
      <div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">What we stand for</h2>
        </div>
        <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          @for (v of values; track v.title) {
            <div class="rounded-2xl border border-border/40 bg-card/60 p-6">
              <div class="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <lucide-icon [name]="v.icon" [size]="24" aria-hidden="true" />
              </div>
              <h3 class="mt-5 text-lg font-semibold">{{ v.title }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ v.text }}</p>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="mx-auto w-full max-w-7xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
      <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">Want to know more?</h2>
      <p class="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
        We'd love to hear from you — whether you're moving, driving, or partnering with us.
      </p>
      <a
        routerLink="/contact"
        class="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-btn-primary transition hover:bg-brand-green-dark"
      >
        <lucide-icon name="mail" [size]="18" aria-hidden="true" />
        Contact us
      </a>
    </section>
  `,
})
export class AboutComponent {
  readonly values: Value[] = [
    { icon: 'zap', title: 'Transparency', text: 'Upfront pricing and clear communication at every step. What you see is what you pay.' },
    { icon: 'shield-check', title: 'Trust & safety', text: 'Verified drivers, secure payments and in-app coordination keep every move safe.' },
    { icon: 'heart', title: 'Fairness', text: 'A fair deal for customers and a fair payout for drivers on every completed job.' },
    { icon: 'users', title: 'Community', text: 'Ratings and reviews keep quality high and build a community you can rely on.' },
    { icon: 'route', title: 'Reliability', text: 'Accurate routes, real ETAs and dependable service you can plan your day around.' },
    { icon: 'smartphone', title: 'Simplicity', text: 'Everything in one app — book, track, chat and pay without the hassle.' },
  ];
}
