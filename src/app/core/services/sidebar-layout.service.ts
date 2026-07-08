import { Injectable } from '@angular/core';

const WIDTH_EXPANDED = '16rem';

/** Keeps customer / driver / admin sidebars at the expanded desktop width. */
@Injectable({ providedIn: 'root' })
export class SidebarLayoutService {
  constructor() {
    this.applyExpandedWidths();
  }

  private applyExpandedWidths(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('sidebar-collapsed', 'admin-sidebar-collapsed');
    document.documentElement.style.setProperty('--app-sidebar-width', WIDTH_EXPANDED);
    document.documentElement.style.setProperty('--admin-sidebar-width', WIDTH_EXPANDED);
    try {
      localStorage.removeItem('movingmate.sidebar.collapsed');
      localStorage.removeItem('movingmate.admin.sidebar.collapsed');
    } catch {
      /* private mode / blocked storage */
    }
  }
}
