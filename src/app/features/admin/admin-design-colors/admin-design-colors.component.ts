import { ChangeDetectionStrategy, Component, inject, input, OnInit } from '@angular/core';
import type { AdminOrder } from '../../../core/services/admin.service';
import type { AdminPreviewDestination, AdminPreviewGroup } from '../../../core/config/admin-design-preview.config';
import { AdminDesignPreviewService } from '../../../core/services/admin-design-preview.service';
import { ThemeEditorService } from '../../../core/services/theme-editor.service';

@Component({
  selector: 'app-admin-design-colors',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <p class="text-sm leading-relaxed text-muted-foreground">
        These are the screens in the app. Open one, click a part of it, and choose Everywhere or only that side before you save.
      </p>

      @for (group of preview.groupOrder; track group) {
        @if (preview.destinationsByGroup().get(group); as items) {
          <section class="overflow-hidden rounded-xl border border-border bg-card">
            <h2 class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {{ preview.groupLabel(group) }}
            </h2>
            <ul>
              @for (item of items; track item.path + (item.query ?? '') + item.label) {
                <li class="border-b border-border/60 last:border-b-0">
                  <button
                    type="button"
                    class="flex min-h-11 w-full flex-col items-start px-4 py-3 text-left transition hover:bg-secondary/30"
                    (click)="openScreen(item)"
                  >
                    <span class="text-sm font-medium text-card-foreground">{{ item.label }}</span>
                    <span class="font-mono text-[11px] text-muted-foreground">{{ screenPath(item) }}</span>
                  </button>
                </li>
              }
              @for (item of extraScreens(group); track item.label) {
                <li class="border-b border-border/60 last:border-b-0">
                  @if (item.path) {
                    <button
                      type="button"
                      class="flex min-h-11 w-full flex-col items-start px-4 py-3 text-left transition hover:bg-secondary/30"
                      (click)="openScreen(item)"
                    >
                      <span class="text-sm font-medium text-card-foreground">{{ item.label }}</span>
                      <span class="font-mono text-[11px] text-muted-foreground">{{ item.path }}</span>
                    </button>
                  } @else {
                    <div class="px-4 py-3">
                      <p class="text-sm font-medium text-card-foreground">{{ item.label }}</p>
                      <p class="text-[11px] text-muted-foreground">Shown here after an order exists.</p>
                    </div>
                  }
                </li>
              }
            </ul>
          </section>
        }
      }
    </div>
  `,
})
export class AdminDesignColorsComponent implements OnInit {
  readonly orders = input<AdminOrder[]>([]);

  readonly preview = inject(AdminDesignPreviewService);
  private readonly theme = inject(ThemeEditorService);

  ngOnInit(): void {
    this.theme.stopPageEdit();
  }

  screenPath(item: AdminPreviewDestination): string {
    return item.query ? `${item.path}?${item.query}` : item.path;
  }

  extraScreens(group: AdminPreviewGroup): AdminPreviewDestination[] {
    const id = this.orders()[0]?._id ?? '';
    const screen = (path: string, label: string): AdminPreviewDestination => ({
      path,
      label,
      group,
      scopes: ['global', 'global-shared'],
    });
    if (group === 'customer') {
      return [
        screen(id ? `/customer/orders/${id}` : '', 'Order details'),
        screen(id ? `/customer/orders/${id}/checkout` : '', 'Checkout'),
        screen(id ? `/rate-driver/${id}` : '', 'Rate driver'),
      ];
    }
    if (group === 'driver') {
      return [
        screen(id ? `/driver/job/${id}` : '', 'Job details'),
        screen(id ? `/driver/active/${id}` : '', 'Active delivery'),
      ];
    }
    return [];
  }

  async openScreen(item: AdminPreviewDestination): Promise<void> {
    if (!item.path) return;
    const opened = await this.preview.navigateTo(item);
    if (!opened) return;
    this.theme.startPageEdit();
  }
}
