import {
  Component,
  ChangeDetectionStrategy,
  inject,
  HostListener,
  signal,
  computed,
  effect,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeEditorService } from '../../../core/services/theme-editor.service';
import { DESIGN_SCOPE_META } from '../../../core/config/admin-design-preview.config';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-theme-editor',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showFloatingToggle()) {
      <button
        type="button"
        (click)="toggleEditor()"
        class="fixed bottom-4 z-[9999] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105"
        [class.right-4]="anchor() === 'right'"
        [class.left-[4.75rem]]="anchor() === 'left'"
        style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border: 2px solid rgba(255,255,255,0.2);"
        [class.ring-2]="themeEditor.isOpen()"
        [class.ring-blue-400]="themeEditor.isOpen()"
        title="Theme Editor"
      >
        <span class="text-lg">🎨</span>
      </button>
    }

    @if (themeEditor.isOpen()) {
      <div
        class="theme-editor-panel fixed z-[9998] flex flex-col overflow-hidden rounded-xl shadow-2xl"
        [class.right-4]="anchor() === 'right'"
        [class.left-4]="anchor() === 'left'"
        [style.bottom]="panelBottom()"
        [style.width]="'340px'"
        [style.maxHeight]="'calc(100vh - 120px)'"
        style="background: #111827; border: 1px solid rgba(59, 130, 246, 0.3);"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3" style="background: #1f2937; border-bottom: 1px solid rgba(255,255,255,0.1);">
          <h2 class="flex items-center gap-2 text-sm font-bold text-white">
            <span>🎨</span> Theme Editor
          </h2>
          <div class="flex items-center gap-1">
            <button
              type="button"
              (click)="inspectMode.set(!inspectMode())"
              class="rounded-lg px-2 py-1 text-[10px] font-medium transition"
              [style.background]="inspectMode() ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.1)'"
              [style.color]="inspectMode() ? '#60a5fa' : '#9ca3af'"
            >
              {{ inspectMode() ? '✓ Inspect ON' : 'Inspect' }}
            </button>
            <button (click)="themeEditor.close()" class="p-1 text-gray-400 hover:text-white">
              <lucide-icon name="x" [size]="16" />
            </button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="flex-1 overflow-y-auto">
          <!-- Quick Color Palette -->
          <div class="p-3" style="background: #1a1f2e;">
            <p class="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-500">Main Colors</p>
            <div class="grid grid-cols-5 gap-2">
              @for (color of mainColors(); track color.name) {
                <button
                  type="button"
                  (click)="selectColor(color.name)"
                  class="group relative flex flex-col items-center"
                  [title]="color.label"
                >
                  <div
                    class="h-10 w-10 rounded-lg shadow-inner transition group-hover:scale-110"
                    [style.background]="color.hexValue"
                    [style.border]="selectedColorName() === color.name ? '2px solid #60a5fa' : '2px solid rgba(255,255,255,0.1)'"
                  ></div>
                  <span class="mt-1 text-[8px] text-gray-500">{{ color.shortLabel }}</span>
                  @if (color.modified) {
                    <span class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-blue-500"></span>
                  }
                </button>
              }
            </div>
          </div>

          <!-- Selected Color Editor -->
          @if (selectedColor(); as color) {
            <div class="border-t border-gray-800 p-3">
              <div class="mb-2 flex items-center justify-between">
                <p class="text-xs font-semibold text-white">{{ color.label }}</p>
                <span class="font-mono text-[10px] text-gray-500">{{ color.name }}</span>
              </div>
              <div class="flex items-center gap-3">
                <input
                  type="color"
                  [value]="color.hexValue"
                  (input)="onColorChange(color.name, $event)"
                  class="h-12 w-16 cursor-pointer rounded-lg"
                  style="border: 2px solid rgba(255,255,255,0.2);"
                />
                <div class="flex-1">
                  <input
                    type="text"
                    [value]="color.hexValue"
                    (change)="onHexInput(color.name, $event)"
                    class="mb-1 w-full rounded bg-gray-800 px-2 py-1 font-mono text-xs text-white"
                    maxlength="7"
                  />
                  @if (color.modified) {
                    <button
                      (click)="themeEditor.resetVariable(color.name)"
                      class="text-[10px] text-red-400 hover:text-red-300"
                    >
                      Reset to original
                    </button>
                  }
                </div>
              </div>
            </div>
          }

          <!-- Inspected Element -->
          @if (inspectMode() && themeEditor.selectedElement(); as el) {
            <div class="border-t border-gray-800 p-3">
              <div class="mb-2 flex items-center justify-between">
                <p class="text-[10px] font-medium text-blue-400">
                  Inspecting: &lt;{{ el.tagName }}&gt;
                </p>
                <button
                  (click)="themeEditor.clearSelection()"
                  class="text-[10px] text-gray-500 hover:text-white"
                >
                  Clear
                </button>
              </div>
              @if (el.designScope; as scope) {
                <p
                  class="mb-2 rounded-md bg-violet-900/30 px-2 py-1.5 text-[10px] leading-snug text-violet-200"
                  [title]="scopeDescription(scope)"
                >
                  <span class="font-semibold">Scope: {{ el.designScopeLabel }}</span>
                  — {{ scopeDescription(scope) }}
                </p>
              } @else {
                <p class="mb-2 text-[10px] leading-snug text-gray-500">
                  Scope: <span class="text-violet-300">Global</span> — theme tokens apply app-wide unless a role shell overrides layout.
                </p>
              }
              <div class="space-y-2">
                @for (c of el.colors; track c.id) {
                  <div class="flex items-center gap-2 rounded bg-gray-800/50 p-2">
                    <div
                      class="h-6 w-6 rounded"
                      [style.background]="c.actualHex"
                      [style.border]="'1px solid rgba(255,255,255,0.2)'"
                    ></div>
                    <div class="min-w-0 flex-1">
                      <p class="text-[10px] font-medium text-gray-300">{{ c.type | titlecase }}</p>
                    </div>
                    <select
                      [value]="c.selectedVariable"
                      (change)="onInspectVariableChange(c.id, $event)"
                      class="rounded bg-gray-700 px-1 py-0.5 text-[10px] text-white"
                    >
                      @for (v of themeEditor.variables(); track v.name) {
                        <option [value]="v.name">{{ v.label }}</option>
                      }
                    </select>
                    <input
                      type="color"
                      [value]="getVariableHex(c.selectedVariable)"
                      (input)="onColorChange(c.selectedVariable, $event)"
                      class="h-6 w-8 cursor-pointer rounded"
                    />
                  </div>
                }
              </div>
            </div>
          }

          <!-- All Variables -->
          <div class="border-t border-gray-800 p-3">
            <details class="group">
              <summary class="mb-2 cursor-pointer text-[10px] font-medium uppercase tracking-wide text-gray-500">
                All Variables <span class="text-gray-600">({{ themeEditor.variables().length }})</span>
              </summary>
              <div class="mt-2 max-h-[200px] space-y-1 overflow-y-auto">
                @for (v of themeEditor.variables(); track v.name) {
                  <div
                    class="flex items-center gap-2 rounded px-2 py-1 transition hover:bg-gray-800"
                    [class.bg-blue-900/20]="v.modified"
                  >
                    <input
                      type="color"
                      [value]="v.hexValue"
                      (input)="onColorChange(v.name, $event)"
                      class="h-5 w-5 cursor-pointer rounded"
                    />
                    <span class="flex-1 text-[10px] text-gray-300">{{ v.label }}</span>
                    <span class="font-mono text-[9px] text-gray-600">{{ v.hexValue }}</span>
                  </div>
                }
              </div>
            </details>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center gap-2 border-t border-gray-800 bg-gray-900/50 p-3">
          @if (themeEditor.saveMessage(); as msg) {
            <span
              class="flex-1 text-[10px] font-medium"
              [class.text-green-400]="msg.type === 'success'"
              [class.text-red-400]="msg.type === 'error'"
            >
              {{ msg.text }}
            </span>
          } @else {
            <span class="flex-1 text-[10px] text-gray-500">
              {{ modifiedCount() }} change{{ modifiedCount() === 1 ? '' : 's' }}
            </span>
          }
          
          <button
            (click)="themeEditor.resetAll()"
            [disabled]="!themeEditor.hasChanges()"
            class="rounded px-2 py-1 text-[10px] font-medium text-gray-400 transition hover:bg-gray-800 disabled:opacity-40"
          >
            Reset
          </button>
          <button
            (click)="themeEditor.saveTheme()"
            [disabled]="!themeEditor.hasChanges() || themeEditor.isSaving()"
            class="rounded bg-blue-600 px-3 py-1 text-[10px] font-bold text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            {{ themeEditor.isSaving() ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    }

    <!-- Hover Highlight -->
    @if (inspectMode() && themeEditor.isOpen() && hoveredEl()) {
      <div
        class="pointer-events-none fixed z-[9990] rounded"
        style="border: 2px solid #3b82f6; background: rgba(59, 130, 246, 0.1);"
        [style.top.px]="hoveredRect()?.top"
        [style.left.px]="hoveredRect()?.left"
        [style.width.px]="hoveredRect()?.width"
        [style.height.px]="hoveredRect()?.height"
      ></div>
    }
  `,
  styles: [`
    :host { display: contents; }
    
    .theme-editor-panel {
      scrollbar-width: thin;
      scrollbar-color: rgba(59, 130, 246, 0.3) transparent;
    }
    .theme-editor-panel ::-webkit-scrollbar { width: 6px; }
    .theme-editor-panel ::-webkit-scrollbar-track { background: transparent; }
    .theme-editor-panel ::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.3); border-radius: 3px; }

    input[type="color"] {
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      cursor: pointer;
    }
    input[type="color"]::-webkit-color-swatch-wrapper { padding: 2px; }
    input[type="color"]::-webkit-color-swatch { border: none; border-radius: 4px; }

    select { background-image: none; }
  `],
})
export class ThemeEditorComponent {
  readonly anchor = input<'left' | 'right'>('right');
  readonly showFloatingToggle = input(true);

  readonly themeEditor = inject(ThemeEditorService);
  
  readonly inspectMode = signal(false);
  readonly selectedColorName = signal<string | null>(null);
  readonly hoveredEl = signal<HTMLElement | null>(null);

  readonly mainColors = computed(() => {
    const vars = this.themeEditor.variables();
    const mainNames = [
      '--background', '--card', '--primary', '--secondary', '--muted',
      '--foreground', '--muted-foreground', '--primary-foreground', '--border', '--destructive'
    ];
    return vars
      .filter(v => mainNames.includes(v.name))
      .map(v => ({
        ...v,
        shortLabel: v.label.split(' ')[0].substring(0, 4),
      }));
  });

  readonly selectedColor = computed(() => {
    const name = this.selectedColorName();
    if (!name) return null;
    return this.themeEditor.variables().find(v => v.name === name) || null;
  });

  readonly modifiedCount = computed(() =>
    this.themeEditor.variables().filter(v => v.modified).length
  );

  readonly hoveredRect = computed(() => {
    const el = this.hoveredEl();
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  });

  readonly panelBottom = computed(() => (this.anchor() === 'left' ? '80px' : '80px'));

  scopeDescription(scope: string): string {
    const meta = DESIGN_SCOPE_META[scope as keyof typeof DESIGN_SCOPE_META];
    return meta?.description ?? '';
  }

  constructor() {
    effect(() => {
      if (this.inspectMode() && this.themeEditor.isOpen()) {
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('click', this.onMouseClick, true);
      } else {
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('click', this.onMouseClick, true);
        this.hoveredEl.set(null);
      }
    });
  }

  toggleEditor(): void {
    this.themeEditor.toggle();
    if (!this.themeEditor.isOpen()) {
      this.inspectMode.set(false);
      this.selectedColorName.set(null);
    }
  }

  selectColor(name: string): void {
    this.selectedColorName.set(this.selectedColorName() === name ? null : name);
  }

  getVariableHex(name: string): string {
    return this.themeEditor.variables().find(v => v.name === name)?.hexValue || '#000000';
  }

  onColorChange(name: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.themeEditor.updateVariable(name, input.value);
  }

  onHexInput(name: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    let hex = input.value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      this.themeEditor.updateVariable(name, hex);
    }
  }

  onInspectVariableChange(colorId: string, event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.themeEditor.changeSelectedVariable(colorId, select.value);
  }

  private onMouseMove = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (target.closest('.theme-editor-panel, .admin-design-hub-panel, .admin-design-hub-fab')) {
      this.hoveredEl.set(null);
      return;
    }
    this.hoveredEl.set(target);
    this.themeEditor.setHoveredElement(target);
  };

  private onMouseClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (target.closest('.theme-editor-panel, .admin-design-hub-panel, .admin-design-hub-fab')) return;
    
    e.preventDefault();
    e.stopPropagation();
    this.themeEditor.selectElement(target);
  };

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.inspectMode()) {
      this.inspectMode.set(false);
    } else if (this.selectedColorName()) {
      this.selectedColorName.set(null);
    } else if (this.themeEditor.selectedElement()) {
      this.themeEditor.clearSelection();
    } else {
      this.themeEditor.close();
    }
  }
}
