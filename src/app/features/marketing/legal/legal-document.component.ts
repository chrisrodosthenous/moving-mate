import { ViewportScroller } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import { PageHeroComponent } from '../shared/page-hero.component';
import { legalDocument, type LegalDocId } from './legal-content';

@Component({
  selector: 'web-legal-document',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeroComponent],
  template: `
    @if (doc(); as d) {
      <web-page-hero [eyebrow]="d.eyebrow" [title]="d.title" [subtitle]="d.subtitle" />

      <article class="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <nav
          class="sticky top-0 z-20 -mx-4 border-b border-border/40 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
          aria-label="Legal documents"
        >
          <div class="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            @for (link of siblingLinks; track link.path) {
              <a
                [routerLink]="link.path"
                class="font-medium text-primary transition hover:text-primary/90 hover:underline"
                [attr.aria-current]="link.id === d.id ? 'page' : null"
              >
                {{ link.label }}
              </a>
            }
          </div>
        </nav>

        <p class="mt-6 text-sm text-muted-foreground">Last updated: {{ d.lastUpdated }}</p>

        <nav class="mt-6 rounded-xl border border-border/40 bg-popover/40 p-4 sm:p-5" aria-label="On this page">
          <p class="text-xs font-semibold uppercase tracking-wide text-foreground">On this page</p>
          <ol class="mt-3 space-y-2 text-sm">
            @for (section of d.sections; track section.id) {
              <li>
                <a
                  [routerLink]="[]"
                  [fragment]="section.id"
                  class="text-muted-foreground transition hover:text-primary hover:underline"
                >
                  {{ section.heading }}
                </a>
              </li>
            }
          </ol>
        </nav>

        <div class="mt-10 space-y-10">
          @for (section of d.sections; track section.id) {
            <section [attr.id]="section.id" class="scroll-mt-24">
              <h2 class="text-xl font-semibold tracking-tight text-foreground">{{ section.heading }}</h2>
              @for (p of section.paragraphs; track $index) {
                <p class="mt-3 text-base leading-relaxed text-muted-foreground">{{ p }}</p>
              }
              @if (section.bullets?.length) {
                <ul class="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground">
                  @for (item of section.bullets; track item) {
                    <li>{{ item }}</li>
                  }
                </ul>
              }
            </section>
          }
        </div>
      </article>
    }
  `,
})
export class LegalDocumentComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly viewport = inject(ViewportScroller);

  readonly doc = toSignal(
    this.route.data.pipe(
      map((data) => {
        const id = data['legalDoc'] as LegalDocId | undefined;
        return id ? legalDocument(id) : null;
      }),
    ),
    { initialValue: null },
  );

  readonly fragment = toSignal(this.route.fragment, { initialValue: null as string | null });

  readonly siblingLinks = [
    { id: 'privacy' as const, label: 'Privacy Policy', path: '/privacy' },
    { id: 'terms' as const, label: 'Terms of Service', path: '/terms' },
    { id: 'cookies' as const, label: 'Cookie notice', path: '/cookies' },
  ];

  constructor() {
    // Same LegalDocumentComponent is reused across /privacy|/terms|/cookies — force top
    // (or the in-page section) after each navigation.
    effect(() => {
      const d = this.doc();
      const fragment = this.fragment();
      if (!d) return;
      // After paint so the new document height is ready (footer clicks leave you mid-page otherwise).
      requestAnimationFrame(() => {
        if (fragment) {
          this.viewport.scrollToAnchor(fragment);
        } else {
          this.viewport.scrollToPosition([0, 0]);
        }
      });
    });
  }
}
