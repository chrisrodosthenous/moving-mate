import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  readDesignScopeFromElement,
  DESIGN_SCOPE_META,
  type DesignScopeId,
} from '../config/admin-design-preview.config';

export interface ThemeVariable {
  name: string;
  label: string;
  category: 'backgrounds' | 'text' | 'accents' | 'borders' | 'status';
  hslValue: string;
  hexValue: string;
  originalHex: string;
  modified: boolean;
}

export interface DetectedColor {
  id: string;
  type: 'background' | 'text' | 'border';
  label: string;
  actualHex: string;
  selectedVariable: string;
  selectedVariableLabel: string;
  source: 'class' | 'computed' | 'inherited';
  className?: string;
  isTransparent: boolean;
}

export interface SelectedElement {
  element: HTMLElement;
  tagName: string;
  classes: string;
  rect: DOMRect;
  colors: DetectedColor[];
  designScope: DesignScopeId | null;
  designScopeLabel: string | null;
}

const CLASS_TO_VARIABLE: Record<string, { variable: string; type: 'background' | 'text' | 'border' }> = {
  'bg-background': { variable: '--background', type: 'background' },
  'bg-card': { variable: '--card', type: 'background' },
  'bg-popover': { variable: '--popover', type: 'background' },
  'bg-muted': { variable: '--muted', type: 'background' },
  'bg-input': { variable: '--input', type: 'background' },
  'bg-primary': { variable: '--primary', type: 'background' },
  'bg-secondary': { variable: '--secondary', type: 'background' },
  'bg-accent': { variable: '--accent', type: 'background' },
  'bg-destructive': { variable: '--destructive', type: 'background' },
  'bg-white': { variable: '--card', type: 'background' },
  'bg-black': { variable: '--background', type: 'background' },

  'text-foreground': { variable: '--foreground', type: 'text' },
  'text-card-foreground': { variable: '--card-foreground', type: 'text' },
  'text-popover-foreground': { variable: '--popover-foreground', type: 'text' },
  'text-muted-foreground': { variable: '--muted-foreground', type: 'text' },
  'text-muted': { variable: '--muted-foreground', type: 'text' },
  'text-primary': { variable: '--primary', type: 'text' },
  'text-primary-foreground': { variable: '--primary-foreground', type: 'text' },
  'text-secondary': { variable: '--secondary', type: 'text' },
  'text-secondary-foreground': { variable: '--secondary-foreground', type: 'text' },
  'text-accent': { variable: '--accent', type: 'text' },
  'text-accent-foreground': { variable: '--accent-foreground', type: 'text' },
  'text-destructive': { variable: '--destructive', type: 'text' },
  'text-card-title': { variable: '--card-foreground', type: 'text' },
  'text-white': { variable: '--card-foreground', type: 'text' },
  'text-black': { variable: '--foreground', type: 'text' },

  'border-border': { variable: '--border', type: 'border' },
  'border-input': { variable: '--input', type: 'border' },
  'border-primary': { variable: '--primary', type: 'border' },
  'border-secondary': { variable: '--secondary', type: 'border' },
  'border-destructive': { variable: '--destructive', type: 'border' },
  'border-muted': { variable: '--muted', type: 'border' },
  'ring-ring': { variable: '--ring', type: 'border' },
  'ring-primary': { variable: '--primary', type: 'border' },
  'ring-border': { variable: '--border', type: 'border' },
};

const VARIABLE_LABELS: Record<string, string> = {
  '--background': 'Background',
  '--card': 'Card',
  '--popover': 'Popover',
  '--muted': 'Muted',
  '--input': 'Input',
  '--foreground': 'Text',
  '--card-foreground': 'Card Text',
  '--popover-foreground': 'Popover Text',
  '--muted-foreground': 'Muted Text',
  '--primary': 'Primary',
  '--primary-foreground': 'Primary Text',
  '--secondary': 'Secondary',
  '--secondary-foreground': 'Secondary Text',
  '--accent': 'Accent',
  '--accent-foreground': 'Accent Text',
  '--destructive': 'Destructive',
  '--border': 'Border',
  '--ring': 'Ring',
  '--success': 'Success',
  '--warning': 'Warning',
  '--error': 'Error',
  '--info': 'Info',
};

const EDITABLE_VARIABLES: Omit<ThemeVariable, 'hslValue' | 'hexValue' | 'originalHex' | 'modified'>[] = [
  { name: '--background', label: 'Background', category: 'backgrounds' },
  { name: '--card', label: 'Card', category: 'backgrounds' },
  { name: '--popover', label: 'Popover/Sidebar', category: 'backgrounds' },
  { name: '--muted', label: 'Muted Surface', category: 'backgrounds' },
  { name: '--input', label: 'Input Background', category: 'backgrounds' },
  { name: '--foreground', label: 'Primary Text', category: 'text' },
  { name: '--card-foreground', label: 'Card Text', category: 'text' },
  { name: '--popover-foreground', label: 'Popover Text', category: 'text' },
  { name: '--muted-foreground', label: 'Muted Text', category: 'text' },
  { name: '--primary', label: 'Primary', category: 'accents' },
  { name: '--primary-foreground', label: 'Primary Text', category: 'accents' },
  { name: '--secondary', label: 'Secondary', category: 'accents' },
  { name: '--secondary-foreground', label: 'Secondary Text', category: 'accents' },
  { name: '--accent', label: 'Accent', category: 'accents' },
  { name: '--accent-foreground', label: 'Accent Text', category: 'accents' },
  { name: '--destructive', label: 'Destructive', category: 'accents' },
  { name: '--border', label: 'Border', category: 'borders' },
  { name: '--ring', label: 'Focus Ring', category: 'borders' },
  { name: '--success', label: 'Success', category: 'status' },
  { name: '--warning', label: 'Warning', category: 'status' },
  { name: '--error', label: 'Error', category: 'status' },
  { name: '--info', label: 'Info', category: 'status' },
];

@Injectable({ providedIn: 'root' })
export class ThemeEditorService {
  private readonly http = inject(HttpClient);

  readonly isOpen = signal(false);
  
  /** Inspect mode is always active when panel is open */
  readonly isInspectMode = computed(() => this.isOpen());
  readonly hoveredElement = signal<HTMLElement | null>(null);
  readonly selectedElement = signal<SelectedElement | null>(null);
  readonly variables = signal<ThemeVariable[]>([]);
  readonly isSaving = signal(false);
  readonly saveMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  readonly hasChanges = computed(() => this.variables().some(v => v.modified));

  readonly variablesByCategory = computed(() => {
    const vars = this.variables();
    return {
      backgrounds: vars.filter(v => v.category === 'backgrounds'),
      text: vars.filter(v => v.category === 'text'),
      accents: vars.filter(v => v.category === 'accents'),
      borders: vars.filter(v => v.category === 'borders'),
      status: vars.filter(v => v.category === 'status'),
    };
  });

  constructor() {
    this.loadCurrentTheme();
  }

  toggle(): void {
    const wasOpen = this.isOpen();
    this.isOpen.set(!wasOpen);
    if (!wasOpen) {
      this.loadCurrentTheme();
    } else {
      this.clearSelection();
    }
  }

  open(): void {
    this.isOpen.set(true);
    this.loadCurrentTheme();
  }

  close(): void {
    this.isOpen.set(false);
    this.hoveredElement.set(null);
    this.selectedElement.set(null);
  }

  /** No longer needed - inspect mode is always on when panel is open */
  toggleInspectMode(): void {
    // Keep for compatibility but does nothing now
  }

  setHoveredElement(el: HTMLElement | null): void {
    this.hoveredElement.set(el);
  }

  clearSelection(): void {
    this.selectedElement.set(null);
  }

  /**
   * Select an element and ALWAYS detect its colors
   */
  selectElement(el: HTMLElement): void {
    const colors: DetectedColor[] = [];
    let colorId = 0;

    const computed = getComputedStyle(el);

    // 1. ALWAYS detect background color
    const bgColor = computed.backgroundColor;
    const bgHex = this.rgbToHex(bgColor);
    const bgIsTransparent = this.isTransparentColor(bgColor);
    const bgClassMatch = this.findClassMatch(el, 'background');
    const bgVariable = bgClassMatch?.variable || this.findClosestVariable(bgHex, 'backgrounds') || '--background';

    colors.push({
      id: `color-${colorId++}`,
      type: 'background',
      label: 'Background',
      actualHex: bgIsTransparent ? this.getInheritedBackgroundColor(el) : bgHex,
      selectedVariable: bgVariable,
      selectedVariableLabel: VARIABLE_LABELS[bgVariable] || bgVariable,
      source: bgClassMatch ? 'class' : (bgIsTransparent ? 'inherited' : 'computed'),
      className: bgClassMatch?.className,
      isTransparent: bgIsTransparent,
    });

    // 2. ALWAYS detect text color
    const textColor = computed.color;
    const textHex = this.rgbToHex(textColor);
    const textClassMatch = this.findClassMatch(el, 'text');
    const textVariable = textClassMatch?.variable || this.findClosestVariable(textHex, 'text') || '--foreground';

    colors.push({
      id: `color-${colorId++}`,
      type: 'text',
      label: 'Text',
      actualHex: textHex,
      selectedVariable: textVariable,
      selectedVariableLabel: VARIABLE_LABELS[textVariable] || textVariable,
      source: textClassMatch ? 'class' : 'computed',
      className: textClassMatch?.className,
      isTransparent: false,
    });

    // 3. ALWAYS detect border color (even if no visible border)
    const borderColor = computed.borderTopColor || computed.borderColor;
    const borderHex = this.rgbToHex(borderColor);
    const borderWidth = parseFloat(computed.borderWidth) || parseFloat(computed.borderTopWidth) || 0;
    const borderClassMatch = this.findClassMatch(el, 'border');
    const borderVariable = borderClassMatch?.variable || this.findClosestVariable(borderHex, 'borders') || '--border';
    const borderIsTransparent = this.isTransparentColor(borderColor) || borderWidth === 0;

    colors.push({
      id: `color-${colorId++}`,
      type: 'border',
      label: 'Border',
      actualHex: borderIsTransparent ? '#000000' : borderHex,
      selectedVariable: borderVariable,
      selectedVariableLabel: VARIABLE_LABELS[borderVariable] || borderVariable,
      source: borderClassMatch ? 'class' : 'computed',
      className: borderClassMatch?.className,
      isTransparent: borderIsTransparent,
    });

    const tag = el.tagName.toLowerCase();
    const classList = el.className?.split?.(' ')?.filter(c => c && !c.startsWith('ng-'))?.slice(0, 5) || [];
    const designScope = readDesignScopeFromElement(el);

    this.selectedElement.set({
      element: el,
      tagName: tag,
      classes: classList.join(' '),
      rect: el.getBoundingClientRect(),
      colors,
      designScope,
      designScopeLabel: designScope ? DESIGN_SCOPE_META[designScope].label : null,
    });
  }

  /**
   * Find matching class on element or parents
   */
  private findClassMatch(el: HTMLElement, type: 'background' | 'text' | 'border'): { variable: string; className: string } | null {
    let current: HTMLElement | null = el;
    let depth = 0;
    const maxDepth = 10;
    const prefix = type === 'background' ? 'bg-' : type === 'text' ? 'text-' : 'border-';

    while (current && depth < maxDepth) {
      const classes = current.className?.split?.(' ') || [];

      for (const cls of classes) {
        const trimmedClass = cls.trim();
        if (!trimmedClass.startsWith(prefix) && !(type === 'border' && trimmedClass.startsWith('ring-'))) continue;

        // Check exact match
        const mapping = CLASS_TO_VARIABLE[trimmedClass];
        if (mapping && mapping.type === type) {
          return { variable: mapping.variable, className: trimmedClass };
        }

        // Check prefix match (for opacity modifiers)
        for (const [pattern, patternMapping] of Object.entries(CLASS_TO_VARIABLE)) {
          if (trimmedClass.startsWith(pattern + '/') && patternMapping.type === type) {
            return { variable: patternMapping.variable, className: trimmedClass };
          }
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  }

  /**
   * Get inherited background by walking up the DOM
   */
  private getInheritedBackgroundColor(el: HTMLElement): string {
    let current: HTMLElement | null = el.parentElement;
    let depth = 0;

    while (current && depth < 20) {
      const bg = getComputedStyle(current).backgroundColor;
      if (!this.isTransparentColor(bg)) {
        return this.rgbToHex(bg);
      }
      current = current.parentElement;
      depth++;
    }

    return '#000000';
  }

  private isTransparentColor(color: string): boolean {
    if (!color) return true;
    if (color === 'transparent') return true;
    if (color === 'rgba(0, 0, 0, 0)') return true;
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match && match[4] !== undefined && parseFloat(match[4]) < 0.1) return true;
    return false;
  }

  /**
   * Update a detected color's variable
   */
  updateDetectedColor(colorId: string, hexColor: string): void {
    const selected = this.selectedElement();
    if (!selected) return;

    const color = selected.colors.find(c => c.id === colorId);
    if (!color) return;

    // Update the selected variable
    this.updateVariable(color.selectedVariable, hexColor);

    // Update display
    this.selectedElement.update(sel => {
      if (!sel) return null;
      return {
        ...sel,
        colors: sel.colors.map(c =>
          c.id === colorId ? { ...c, actualHex: hexColor } : c
        ),
      };
    });
  }

  /**
   * Change which variable a color picker controls
   */
  changeSelectedVariable(colorId: string, newVariableName: string): void {
    const varData = this.variables().find(v => v.name === newVariableName);
    if (!varData) return;

    this.selectedElement.update(sel => {
      if (!sel) return null;
      return {
        ...sel,
        colors: sel.colors.map(c =>
          c.id === colorId
            ? {
                ...c,
                selectedVariable: newVariableName,
                selectedVariableLabel: VARIABLE_LABELS[newVariableName] || newVariableName,
                actualHex: varData.hexValue,
              }
            : c
        ),
      };
    });
  }

  private findClosestVariable(hex: string, category: 'backgrounds' | 'text' | 'borders' | 'accents'): string | null {
    const categoryVars = this.variablesByCategory()[category] || [];
    let closestVar: string | null = null;
    let closestDistance = Infinity;

    for (const v of categoryVars) {
      const distance = this.colorDistance(hex, v.hexValue);
      if (distance < closestDistance && distance < 60) {
        closestDistance = distance;
        closestVar = v.name;
      }
    }

    return closestVar;
  }

  private colorDistance(hex1: string, hex2: string): number {
    const rgb1 = this.hexToRgb(hex1);
    const rgb2 = this.hexToRgb(hex2);
    if (!rgb1 || !rgb2) return Infinity;

    return Math.sqrt(
      Math.pow(rgb1.r - rgb2.r, 2) +
      Math.pow(rgb1.g - rgb2.g, 2) +
      Math.pow(rgb1.b - rgb2.b, 2)
    );
  }

  loadCurrentTheme(): void {
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);

    const vars: ThemeVariable[] = EDITABLE_VARIABLES.map(def => {
      const hslValue = computedStyle.getPropertyValue(def.name).trim();
      const hexValue = this.hslStringToHex(hslValue);
      return {
        ...def,
        hslValue,
        hexValue,
        originalHex: hexValue,
        modified: false,
      };
    });

    this.variables.set(vars);
  }

  updateVariable(name: string, hexColor: string): void {
    const hslValue = this.hexToHslString(hexColor);
    document.documentElement.style.setProperty(name, hslValue);

    this.variables.update(vars =>
      vars.map(v =>
        v.name === name
          ? { ...v, hexValue: hexColor, hslValue, modified: v.originalHex !== hexColor }
          : v
      )
    );
  }

  resetVariable(name: string): void {
    const variable = this.variables().find(v => v.name === name);
    if (!variable) return;

    const hslValue = this.hexToHslString(variable.originalHex);
    document.documentElement.style.setProperty(name, hslValue);

    this.variables.update(vars =>
      vars.map(v =>
        v.name === name
          ? { ...v, hexValue: v.originalHex, hslValue, modified: false }
          : v
      )
    );
  }

  resetAll(): void {
    this.variables().forEach(v => {
      const hslValue = this.hexToHslString(v.originalHex);
      document.documentElement.style.setProperty(v.name, hslValue);
    });

    this.variables.update(vars =>
      vars.map(v => ({ ...v, hexValue: v.originalHex, hslValue: this.hexToHslString(v.originalHex), modified: false }))
    );
  }

  async saveTheme(): Promise<boolean> {
    if (!this.hasChanges()) {
      this.saveMessage.set({ type: 'error', text: 'No changes to save.' });
      return false;
    }

    this.isSaving.set(true);
    this.saveMessage.set(null);

    const themeData: Record<string, string> = {};
    this.variables().forEach(v => {
      themeData[v.name] = v.hslValue;
    });

    try {
      const apiUrl = environment.production
        ? '/api/devtools/save-theme'
        : `http://localhost:3000/api/devtools/save-theme`;

      const response = await this.http.post<{ success: boolean; message: string }>(
        apiUrl,
        { variables: themeData }
      ).toPromise();

      if (response?.success) {
        this.variables.update(vars =>
          vars.map(v => ({ ...v, originalHex: v.hexValue, modified: false }))
        );
        this.saveMessage.set({ type: 'success', text: 'Theme saved successfully to global.css!' });
        return true;
      } else {
        this.saveMessage.set({ type: 'error', text: response?.message || 'Failed to save theme.' });
        return false;
      }
    } catch (error: any) {
      console.error('[ThemeEditor] Save failed:', error);
      this.saveMessage.set({
        type: 'error',
        text: error?.error?.message || error?.message || 'Error saving theme. Make sure the server is running.'
      });
      return false;
    } finally {
      this.isSaving.set(false);
      setTimeout(() => this.saveMessage.set(null), 5000);
    }
  }

  exportAsCss(): string {
    const lines = [':root,', '.dark {'];
    this.variables().forEach(v => {
      lines.push(`  ${v.name}: ${v.hslValue};`);
    });
    lines.push('}');
    return lines.join('\n');
  }

  async copyToClipboard(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(this.exportAsCss());
      this.saveMessage.set({ type: 'success', text: 'CSS copied to clipboard!' });
      setTimeout(() => this.saveMessage.set(null), 3000);
      return true;
    } catch {
      this.saveMessage.set({ type: 'error', text: 'Failed to copy.' });
      return false;
    }
  }

  private rgbToHex(rgb: string): string {
    if (!rgb) return '#000000';
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return '#000000';
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }

  private hslStringToHex(hslString: string): string {
    if (!hslString) return '#000000';
    const parts = hslString.split(/\s+/).map(p => parseFloat(p));
    if (parts.length < 3) return '#000000';
    const [h, s, l] = parts;
    return this.hslToHex(h, s, l);
  }

  private hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

    const toHex = (n: number) => {
      const hex = Math.round((n + m) * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  hexToHslString(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '0 0% 0%';

    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  }
}
