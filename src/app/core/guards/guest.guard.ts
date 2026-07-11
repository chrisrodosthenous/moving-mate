import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthStore } from '../../store/auth.store';
import { AdminDesignPreviewService } from '../services/admin-design-preview.service';

/** Redirects to the user's dashboard if already logged in (login/register pages). */
export const guestGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const designPreview = inject(AdminDesignPreviewService);
  if (store.isLoggedIn()) {
    if (store.isAdmin() && designPreview.allowGuestPagePreview()) {
      return true;
    }
    return router.createUrlTree([store.dashboardRoute()]);
  }
  return true;
};
