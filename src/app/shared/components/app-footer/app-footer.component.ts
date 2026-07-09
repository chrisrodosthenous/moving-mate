import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { cn } from '@/lib/utils';
import { APP_FOOTER_TEXT } from '../../constants/app-brand';

@Component({
  selector: 'app-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer [class]="footerClass()">
      {{ text() }}
    </footer>
  `,
})
export class AppFooterComponent {
  readonly text = input(APP_FOOTER_TEXT);
  readonly className = input('');

  footerClass(): string {
    return cn(
      'mt-2 border-t border-border pt-8 text-center text-sm text-muted',
      this.className(),
    );
  }
}
