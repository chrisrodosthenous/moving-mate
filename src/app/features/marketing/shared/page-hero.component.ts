import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Reusable page header band for inner marketing pages. */
@Component({
  selector: 'web-page-hero',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="relative overflow-hidden border-b border-border/40">
      <div
        class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(34,197,94,0.14),transparent)]"
        aria-hidden="true"
      ></div>
      <div class="mx-auto w-full max-w-4xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
        @if (eyebrow()) {
          <span
            class="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary"
          >
            {{ eyebrow() }}
          </span>
        }
        <h1 class="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {{ subtitle() }}
          </p>
        }
      </div>
    </section>
  `,
})
export class PageHeroComponent {
  readonly eyebrow = input('');
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
