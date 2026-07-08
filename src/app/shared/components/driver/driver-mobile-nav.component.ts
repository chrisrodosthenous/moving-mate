import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

/**
 * Thumb-friendly shortcuts for `/driver/*` on small screens. Full nav remains in the sidebar / hamburger drawer.
 */
@Component({
  selector: 'app-driver-mobile-nav',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './driver-mobile-nav.component.html',
})
export class DriverMobileNavComponent {}
