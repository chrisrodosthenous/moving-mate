import type { ActivatedRouteSnapshot, Router } from '@angular/router';

export interface ShellOutletData {
  pageTitle: string;
  shellFullBleed: boolean;
}

function walkLeaf(snapshot: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  let r = snapshot;
  while (r.firstChild) {
    r = r.firstChild;
  }
  return r;
}

/**
 * Resolved `data` for the innermost routed component (below customer/driver shell).
 */
export function leafShellOutletData(router: Router): ShellOutletData {
  const leaf = walkLeaf(router.routerState.snapshot.root);
  const pt = leaf.data['pageTitle'];
  const title = typeof pt === 'string' && pt.trim() ? pt.trim() : '';
  const fullBleed = leaf.data['shellFullBleed'] === true;
  return { pageTitle: title, shellFullBleed: fullBleed };
}
