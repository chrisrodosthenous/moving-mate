import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ADMIN_FLEET_TAB, type AdminFleetTabId } from '../../../core/constants/statuses';
import { parseAdminNavFromUrl, type AdminSection } from '../../utils/admin-section-nav';

@Component({
  selector: 'app-admin-mobile-nav',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './admin-mobile-nav.component.html',
})
export class AdminMobileNavComponent {
  private readonly router = inject(Router);

  isActive(section: AdminSection, fleetTab?: AdminFleetTabId): boolean {
    const nav = parseAdminNavFromUrl(this.router.url);
    if (nav.section !== section) return false;
    if (fleetTab) return nav.fleetTab === fleetTab;
    return true;
  }

  protected readonly pendingTab = ADMIN_FLEET_TAB.PENDING;
}
