import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

/**
 * Thumb-friendly shortcuts for `/customer/*` on small screens. Full nav remains in sidebar / hamburger drawer.
 */
@Component({
  selector: 'app-customer-mobile-nav',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './customer-mobile-nav.component.html',
})
export class CustomerMobileNavComponent {}
