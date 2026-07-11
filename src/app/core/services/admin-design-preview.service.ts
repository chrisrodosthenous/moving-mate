import { Injectable, inject, signal, computed } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import {
  ADMIN_PREVIEW_DESTINATIONS,
  ADMIN_PREVIEW_GROUP_LABELS,
  type AdminPreviewDestination,
  type AdminPreviewGroup,
  resolvePreviewDestination,
  DESIGN_SCOPE_META,
  type DesignScopeId,
} from '../config/admin-design-preview.config';

@Injectable({ providedIn: 'root' })
export class AdminDesignPreviewService {
  private readonly router = inject(Router);

  readonly isOpen = signal(false);
  /** Allows logged-in admin to open login/register for styling preview. */
  readonly allowGuestPagePreview = signal(false);

  readonly currentPath = signal(this.router.url.split('?')[0] || '/');

  readonly currentDestination = computed(() =>
    resolvePreviewDestination(this.currentPath()),
  );

  readonly destinationsByGroup = computed(() => {
    const map = new Map<AdminPreviewGroup, AdminPreviewDestination[]>();
    for (const dest of ADMIN_PREVIEW_DESTINATIONS) {
      const list = map.get(dest.group) ?? [];
      list.push(dest);
      map.set(dest.group, list);
    }
    return map;
  });

  readonly groupOrder: AdminPreviewGroup[] = ['public', 'auth', 'customer', 'driver', 'admin'];

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const path = e.urlAfterRedirects.split('?')[0] || '/';
        this.currentPath.set(path);
        this.syncGuestPreviewFlag(path);
      });
  }

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  groupLabel(group: AdminPreviewGroup): string {
    return ADMIN_PREVIEW_GROUP_LABELS[group];
  }

  scopeLabel(scopeId: DesignScopeId): string {
    return DESIGN_SCOPE_META[scopeId].label;
  }

  scopeDescription(scopeId: DesignScopeId): string {
    return DESIGN_SCOPE_META[scopeId].description;
  }

  navigateTo(dest: AdminPreviewDestination): void {
    if (dest.guestPreview) {
      this.allowGuestPagePreview.set(true);
    } else {
      this.allowGuestPagePreview.set(false);
    }
    void this.router.navigateByUrl(dest.path);
    this.isOpen.set(false);
  }

  isActiveDestination(dest: AdminPreviewDestination): boolean {
    const path = this.currentPath();
    if (path === dest.path) return true;
    return dest.path !== '/' && path.startsWith(dest.path + '/');
  }

  private syncGuestPreviewFlag(path: string): void {
    const isGuestPage =
      path === '/login' ||
      path === '/register' ||
      path === '/forgot-password' ||
      path.startsWith('/reset-password');
    if (!isGuestPage) {
      this.allowGuestPagePreview.set(false);
    }
  }
}
