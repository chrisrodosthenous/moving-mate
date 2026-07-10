import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

/** Text wordmark logo (no image dependency) — green "Moving" + foreground "Mate". */
@Component({
  selector: 'web-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <span class="inline-flex items-center gap-2 font-extrabold tracking-tight" [class]="sizeClass()">
      <span
        class="grid place-items-center rounded-lg bg-primary/15 text-primary"
        [class]="markClass()"
        aria-hidden="true"
      >
        <lucide-icon name="truck" [size]="iconSize()" />
      </span>
      <span class="leading-none">
        <span class="text-primary">Moving</span><span class="text-foreground">&nbsp;Mate</span>
      </span>
    </span>
  `,
})
export class LogoComponent {
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  sizeClass(): string {
    return this.size() === 'lg' ? 'text-2xl' : this.size() === 'sm' ? 'text-lg' : 'text-xl';
  }

  markClass(): string {
    return this.size() === 'lg' ? 'h-10 w-10' : this.size() === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  }

  iconSize(): number {
    return this.size() === 'lg' ? 22 : this.size() === 'sm' ? 16 : 20;
  }
}
