import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { REGISTER_PATH } from '../../shared/brand';

interface Step {
  icon: string;
  title: string;
  text: string;
}

interface Faq {
  q: string;
  a: string;
}

@Component({
  selector: 'web-how-it-works',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule, PageHeroComponent],
  template: `
    <web-page-hero
      eyebrow="How it works"
      title="From quote to delivered in four steps"
      subtitle="Moving Mate keeps the whole move in one place — booking, matching, tracking and payment."
    />

    <section class="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <ol class="relative space-y-10 border-l border-border/50 pl-8">
        @for (step of steps; track step.title; let i = $index) {
          <li class="relative">
            <span
              class="absolute -left-[3.05rem] grid h-10 w-10 place-items-center rounded-full border border-primary/40 bg-background text-primary"
            >
              <lucide-icon [name]="step.icon" [size]="20" aria-hidden="true" />
            </span>
            <div class="rounded-2xl border border-border/40 bg-card/60 p-6">
              <p class="text-xs font-semibold uppercase tracking-wide text-primary">Step {{ i + 1 }}</p>
              <h3 class="mt-1 text-lg font-semibold">{{ step.title }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ step.text }}</p>
            </div>
          </li>
        }
      </ol>
    </section>

    <!-- Pricing explainer -->
    <section class="bg-popover/40 py-16 sm:py-20">
      <div class="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
        <div class="text-center">
          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">Simple, transparent pricing</h2>
          <p class="mt-4 text-lg text-muted-foreground">
            Your price is a base fee plus a per-kilometre rate for the vehicle you choose. Add-ons like
            loading help or carrying up floors are always shown before you confirm.
          </p>
        </div>
        <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          @for (tier of tiers; track tier.name) {
            <div class="rounded-2xl border border-border/40 bg-card/60 p-6 text-center">
              <div class="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <lucide-icon name="truck" [size]="22" aria-hidden="true" />
              </div>
              <h3 class="mt-4 font-semibold">{{ tier.name }}</h3>
              <p class="mt-2 text-sm text-muted-foreground">{{ tier.base }} base</p>
              <p class="text-sm text-muted-foreground">{{ tier.km }}/km</p>
            </div>
          }
        </div>
        <p class="mt-6 text-center text-xs text-muted-foreground">
          Example rates shown for illustration. Add-ons: loading help and per-floor carrying (when no
          elevator) are added transparently.
        </p>
      </div>
    </section>

    <!-- FAQ -->
    <section class="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <h2 class="text-center text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h2>
      <div class="mt-10 space-y-3">
        @for (item of faqs; track item.q) {
          <details class="group rounded-2xl border border-border/40 bg-card/60 p-5">
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-foreground"
            >
              {{ item.q }}
              <lucide-icon
                name="arrow-right"
                [size]="18"
                class="shrink-0 text-primary transition group-open:rotate-90"
                aria-hidden="true"
              />
            </summary>
            <p class="mt-3 text-sm leading-relaxed text-muted-foreground">{{ item.a }}</p>
          </details>
        }
      </div>

      <div class="mt-12 text-center">
        <a
          [routerLink]="registerPath"
          class="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-btn-primary transition hover:bg-brand-green-dark"
        >
          Start your first move
          <lucide-icon name="arrow-right" [size]="18" aria-hidden="true" />
        </a>
      </div>
    </section>
  `,
})
export class HowItWorksComponent {
  readonly registerPath = REGISTER_PATH;

  readonly steps: Step[] = [
    { icon: 'map-pin', title: 'Enter your move details', text: 'Add pickup and drop-off addresses, choose a vehicle tier and any extras such as loading help or floors.' },
    { icon: 'zap', title: 'Get an instant quote', text: 'We calculate a transparent price from the real driving route, vehicle rate and add-ons — no hidden fees.' },
    { icon: 'shield-check', title: 'Get matched with a driver', text: 'A nearby verified driver accepts your job. Chat in-app to confirm any details before pickup.' },
    { icon: 'credit-card', title: 'Track, deliver, pay', text: 'Follow the move live. Your secure payment is released to the driver only once everything arrives.' },
  ];

  readonly tiers = [
    { name: 'Pickup', base: '€10', km: '€1.50' },
    { name: 'Minivan', base: '€15', km: '€2.00' },
    { name: 'Van', base: '€25', km: '€2.50' },
    { name: 'Truck', base: '€40', km: '€3.50' },
  ];

  readonly faqs: Faq[] = [
    { q: 'How is the price calculated?', a: 'A base fee for your chosen vehicle plus a per-kilometre rate along the real driving route, plus any add-ons like loading help or carrying up floors when there is no elevator.' },
    { q: 'Are the drivers verified?', a: 'Yes. Every driver must pass identity and vehicle verification by our team before they can accept any jobs.' },
    { q: 'When am I charged?', a: 'Your payment is authorised when you book and only released to the driver once your move is completed.' },
    { q: 'What if I need help loading?', a: 'You can add driver assistance (and an extra helper) during booking. The cost is shown upfront before you confirm.' },
    { q: 'Can I track my move?', a: 'Absolutely — you can follow your driver live from pickup to drop-off with real-time ETAs.' },
  ];
}
