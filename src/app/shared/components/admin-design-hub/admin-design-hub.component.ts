import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { AdminDesignPreviewService } from '../../../core/services/admin-design-preview.service';
import { ThemeEditorService } from '../../../core/services/theme-editor.service';
import type { AdminPreviewDestination } from '../../../core/config/admin-design-preview.config';
import type { DesignScopeId } from '../../../core/config/admin-design-preview.config';

@Component({
  selector: 'app-admin-design-hub',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!embedded()) {
      <button
        type="button"
        (click)="preview.toggle()"
        class="admin-design-hub-fab fixed bottom-4 left-4 z-[9999] flex h-12 items-center gap-2 rounded-full px-4 shadow-lg transition-all hover:scale-[1.02]"
        style="background: linear-gradient(135deg, #059669 0%, #047857 100%); border: 2px solid rgba(255,255,255,0.15);"
        [class.ring-2]="preview.isOpen() || themeEditor.isOpen()"
        [class.ring-emerald-400]="preview.isOpen() || themeEditor.isOpen()"
        title="Admin design preview"
        data-design-scope="admin"
      >
        <span class="text-base" aria-hidden="true">🧭</span>
        <span class="hidden text-xs font-semibold text-white xs:inline">Design</span>
      </button>
    }

    @if (preview.isOpen()) {
      <div
        class="admin-design-hub-panel fixed bottom-[4.5rem] left-4 z-[9998] flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl shadow-2xl"
        style="background: #0f172a; border: 1px solid rgba(16, 185, 129, 0.35); max-height: calc(100vh - 7rem);"
        data-design-scope="admin"
      >
        <div
          class="flex items-center justify-between px-4 py-3"
          style="background: #1e293b; border-bottom: 1px solid rgba(255,255,255,0.08);"
        >
          <div>
            <h2 class="text-sm font-bold text-white">Design preview</h2>
            <p class="text-[10px] text-slate-400">Jump to any screen · edit global theme</p>
          </div>
          <button
            type="button"
            (click)="preview.close()"
            class="rounded p-1 text-slate-400 hover:text-white"
            aria-label="Close design preview"
          >
            <lucide-icon name="x" [size]="16" />
          </button>
        </div>

        @if (currentDestination(); as dest) {
          <div class="border-b border-slate-800 px-4 py-2.5">
            <p class="text-[10px] font-medium uppercase tracking-wide text-emerald-400/90">Current page</p>
            <p class="mt-0.5 text-xs font-semibold text-white">{{ dest.label }}</p>
            <p class="font-mono text-[10px] text-slate-500">{{ preview.currentPath() }}</p>
            <div class="mt-2 flex flex-wrap gap-1">
              @for (scope of dest.scopes; track scope) {
                <span
                  class="inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-medium"
                  [class]="scopeBadgeClass(scope)"
                  [title]="preview.scopeDescription(scope)"
                >
                  {{ preview.scopeLabel(scope) }}
                </span>
              }
            </div>
          </div>
        }

        <div class="flex-1 overflow-y-auto p-3">
          @for (group of preview.groupOrder; track group) {
            @if (preview.destinationsByGroup().get(group); as items) {
              <div class="mb-3">
                <p class="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {{ preview.groupLabel(group) }}
                </p>
                <ul class="space-y-1">
                  @for (item of items; track item.path) {
                    <li>
                      <button
                        type="button"
                        (click)="go(item)"
                        class="flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition"
                        [style.background]="preview.isActiveDestination(item) ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)'"
                        [style.border]="preview.isActiveDestination(item) ? '1px solid rgba(16,185,129,0.45)' : '1px solid transparent'"
                      >
                        <span class="text-xs font-medium text-slate-100">{{ item.label }}</span>
                        <span class="font-mono text-[9px] text-slate-500">{{ item.path }}</span>
                        <span class="mt-1 flex flex-wrap gap-1">
                          @for (scope of item.scopes; track scope) {
                            <span class="rounded bg-slate-800 px-1 py-px text-[8px] text-slate-400">
                              {{ preview.scopeLabel(scope) }}
                            </span>
                          }
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              </div>
            }
          }
        </div>

        <div
          class="flex items-center gap-2 border-t border-slate-800 px-3 py-2.5"
          style="background: rgba(15, 23, 42, 0.95);"
        >
          <button
            type="button"
            (click)="openThemeEditor()"
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-emerald-500"
          >
            <span aria-hidden="true">🎨</span>
            Theme colors
          </button>
          <button
            type="button"
            (click)="preview.close()"
            class="rounded-lg px-3 py-2 text-[11px] font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .admin-design-hub-panel {
        scrollbar-width: thin;
        scrollbar-color: rgba(16, 185, 129, 0.35) transparent;
      }
    `,
  ],
})
export class AdminDesignHubComponent {
  readonly embedded = input(false);

  readonly preview = inject(AdminDesignPreviewService);
  readonly themeEditor = inject(ThemeEditorService);

  readonly currentDestination = computed(() => this.preview.currentDestination());

  go(dest: AdminPreviewDestination): void {
    this.preview.navigateTo(dest);
  }

  openThemeEditor(): void {
    this.preview.close();
    this.themeEditor.open();
  }

  scopeBadgeClass(scope: DesignScopeId): string {
    if (scope === 'global') return 'bg-violet-900/50 text-violet-200';
    if (scope === 'global-shared') return 'bg-blue-900/50 text-blue-200';
    if (scope === 'customer') return 'bg-emerald-900/50 text-emerald-200';
    if (scope === 'driver') return 'bg-amber-900/50 text-amber-200';
    if (scope === 'admin') return 'bg-rose-900/50 text-rose-200';
    if (scope === 'marketing') return 'bg-cyan-900/50 text-cyan-200';
    return 'bg-slate-800 text-slate-300';
  }
}
