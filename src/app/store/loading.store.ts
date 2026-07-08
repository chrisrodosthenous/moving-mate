import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  patchState,
} from '@ngrx/signals';
import { computed } from '@angular/core';

/* ────────────────────────────────────────────────────────────────────────────
 * Global loading state — tracks named loading operations so the UI can show
 * spinners or skeleton screens for specific actions.
 * ──────────────────────────────────────────────────────────────────────── */

interface LoadingState {
  /** Map of operation-name → true while that operation is in flight. */
  operations: Record<string, boolean>;
}

export const LoadingStore = signalStore(
  { providedIn: 'root' },

  withState<LoadingState>({ operations: {} }),

  withComputed((store) => ({
    /** True when *any* operation is loading. */
    isAnyLoading: computed(() => Object.values(store.operations()).some(Boolean)),
  })),

  withMethods((store) => ({
    /** Mark a named operation as loading. */
    start(name: string): void {
      patchState(store, { operations: { ...store.operations(), [name]: true } });
    },

    /** Mark a named operation as finished. */
    stop(name: string): void {
      const next = { ...store.operations() };
      delete next[name];
      patchState(store, { operations: next });
    },

    /** Check if a specific operation is loading. */
    isLoading(name: string): boolean {
      return !!store.operations()[name];
    },
  })),
);
