import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { ContactService } from './contact.service';

@Component({
  selector: 'web-contact',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LucideAngularModule, PageHeroComponent],
  template: `
    <web-page-hero
      eyebrow="Contact us"
      title="Get in touch"
      subtitle="Questions, feedback or partnership ideas? Send us a message and we'll get back to you."
    />

    <section class="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div class="grid gap-10 lg:grid-cols-5">
        <!-- Info -->
        <div class="lg:col-span-2">
          <h2 class="text-xl font-bold">We'd love to hear from you</h2>
          <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
            Fill in the form and our team will reply by email as soon as possible.
          </p>
          <ul class="mt-8 space-y-5">
            <li class="flex items-start gap-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <lucide-icon name="mail" [size]="20" aria-hidden="true" />
              </span>
              <div>
                <p class="text-sm font-medium text-foreground">Email</p>
                <p class="text-sm text-muted-foreground">We reply to every message.</p>
              </div>
            </li>
            <li class="flex items-start gap-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <lucide-icon name="message-square" [size]="20" aria-hidden="true" />
              </span>
              <div>
                <p class="text-sm font-medium text-foreground">Support</p>
                <p class="text-sm text-muted-foreground">Help with a move, account or payment.</p>
              </div>
            </li>
            <li class="flex items-start gap-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <lucide-icon name="users" [size]="20" aria-hidden="true" />
              </span>
              <div>
                <p class="text-sm font-medium text-foreground">Partnerships</p>
                <p class="text-sm text-muted-foreground">Drive with us or work together.</p>
              </div>
            </li>
          </ul>
        </div>

        <!-- Form -->
        <div class="lg:col-span-3">
          <form
            [formGroup]="form"
            (ngSubmit)="submit()"
            class="rounded-2xl border border-border/40 bg-card/60 p-6 sm:p-8"
            novalidate
          >
            <div class="grid gap-5 sm:grid-cols-2">
              <div>
                <label for="name" class="mb-1.5 block text-sm font-medium text-foreground">Name</label>
                <input
                  id="name"
                  type="text"
                  formControlName="name"
                  autocomplete="name"
                  placeholder="Your name"
                  [class]="inputClass"
                />
              </div>
              <div>
                <label for="email" class="mb-1.5 block text-sm font-medium text-foreground">
                  Email <span class="text-primary">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  formControlName="email"
                  autocomplete="email"
                  placeholder="you@example.com"
                  [class]="inputClass"
                />
                @if (showError('email')) {
                  <p class="mt-1 text-xs text-primary">Please enter a valid email address.</p>
                }
              </div>
            </div>

            <div class="mt-5">
              <label for="subject" class="mb-1.5 block text-sm font-medium text-foreground">Subject</label>
              <input
                id="subject"
                type="text"
                formControlName="subject"
                placeholder="What is this about?"
                [class]="inputClass"
              />
            </div>

            <div class="mt-5">
              <label for="message" class="mb-1.5 block text-sm font-medium text-foreground">
                Message <span class="text-primary">*</span>
              </label>
              <textarea
                id="message"
                rows="5"
                formControlName="message"
                placeholder="How can we help?"
                [class]="inputClass + ' resize-y'"
              ></textarea>
              @if (showError('message')) {
                <p class="mt-1 text-xs text-primary">Please enter a message.</p>
              }
            </div>

            @if (status() === 'success') {
              <div
                class="mt-5 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground"
                role="status"
              >
                <lucide-icon name="check" [size]="18" class="text-primary" aria-hidden="true" />
                {{ feedback() }}
              </div>
            }
            @if (status() === 'error') {
              <div
                class="mt-5 rounded-lg border border-destructive/40 bg-destructive/20 px-4 py-3 text-sm text-destructive-foreground"
                role="alert"
              >
                {{ feedback() }}
              </div>
            }

            <button
              type="submit"
              [disabled]="status() === 'sending'"
              class="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-btn-primary transition hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              @if (status() === 'sending') {
                <lucide-icon name="loader-2" [size]="18" class="animate-spin" aria-hidden="true" />
                Sending…
              } @else {
                <lucide-icon name="send" [size]="18" aria-hidden="true" />
                Send message
              }
            </button>
          </form>
        </div>
      </div>
    </section>
  `,
})
export class ContactComponent {
  private readonly fb = inject(FormBuilder);
  private readonly contact = inject(ContactService);

  readonly inputClass =
    'w-full rounded-lg border border-border/60 bg-input px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30';

  readonly status = signal<'idle' | 'sending' | 'success' | 'error'>('idle');
  readonly feedback = signal('');

  readonly form = this.fb.nonNullable.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    subject: [''],
    message: ['', [Validators.required, Validators.maxLength(5000)]],
  });

  showError(control: 'email' | 'message'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.status.set('sending');
    this.feedback.set('');
    this.contact.send(this.form.getRawValue()).subscribe({
      next: (res) => {
        this.status.set('success');
        this.feedback.set(res?.message || 'Thanks! Your message has been sent.');
        this.form.reset();
      },
      error: (err) => {
        this.status.set('error');
        this.feedback.set(
          err?.error?.message || 'We could not send your message right now. Please try again later.',
        );
      },
    });
  }
}
