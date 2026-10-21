import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { createId } from '../../../core/create-id';
import { templateAvailability } from '../../../lib/sportask/engine/template-plan';
import { buildContext } from '../../../lib/sportask/session-context';
import { BUILTIN_TEMPLATES } from '../../../lib/sportask/templates';
import { localize } from '../../../lib/sportask/texts';
import { SportDataService } from '../../../services/sport-data.service';
import type { SportTemplate, TemplateSlot } from '../../../types/sportask';
import { SportaskTemplateEditorComponent } from '../sportask-template-editor/sportask-template-editor.component';
import { SportPanelState } from '../sportask-view/sport-panel.state';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/** Most slot names a card spells out. */
const SLOTS_SHOWN = 4;

interface Card {
  id: string;
  name: string;
  builtin: boolean;
  format: string;
  slots: string;
  detail: string;
  unavailable: boolean;
  template: SportTemplate;
}

/**
 * The Templates tab: the built-in free-training templates (read-only, *Duplicate* copies one into an editable template) and the
 * user's own (*Edit*, *Delete*), plus *New template*. Both kinds are what the setup sheet's free training offers.
 */
@Component({
  selector: 'app-sportask-templates',
  standalone: true,
  imports: [TranslatePipe, SportaskTemplateEditorComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-templates.component.html',
  styleUrl: './sportask-templates.component.css',
})
export class SportaskTemplatesComponent {
  protected readonly state = inject(SportPanelState);
  private readonly data = inject(SportDataService);
  private readonly injector = inject(Injector);
  private readonly deleteButton = viewChild<ElementRef<HTMLButtonElement>>('deleteButton');

  protected readonly editing = signal<{ template: SportTemplate; isNew: boolean } | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  /** Whether a template can run with the equipment and limits in the settings (fewer than half its slots resolving is "no"). */
  private readonly ctx = computed(() =>
    buildContext({ blockId: 'panel', blockSeconds: 60, blocks: [], settings: this.state.settings(), equipmentOverride: null }),
  );

  private slotLabel(slot: TemplateSlot): string {
    if ('exerciseId' in slot) return this.state.exerciseName(slot.exerciseId);
    return [this.state.t(`panel.g.${slot.pattern}`), slot.zone ? this.state.t(`panel.g.${slot.zone}`) : '', slot.tag ? this.state.t(`panel.tpl.tags.${slot.tag}`) : ''].filter(Boolean).join(' · ');
  }

  private card(t: SportTemplate): Card {
    const lang = this.state.lang();
    const labels = t.slots.map((s) => this.slotLabel(s));
    const shown = labels.slice(0, SLOTS_SHOWN).join(', ');
    const more = labels.length - SLOTS_SHOWN;
    const format =
      t.format === 'intervals'
        ? this.state.t('panel.tpl.fmtIntervals', { work: t.workSeconds ?? 30, rest: t.restSeconds ?? 30 })
        : this.state.t(`panel.tpl.fmt.${t.format}`);
    const min = t.minSeconds ? (t.minSeconds < 60 ? this.state.t('panel.tpl.minSec', { n: t.minSeconds }) : this.state.t('panel.tpl.min', { n: Math.ceil(t.minSeconds / 60) })) : '';
    return {
      id: t.id,
      name: t.builtin ? localize(t.nameText, lang) || t.name : t.name,
      builtin: t.builtin === true,
      format,
      slots: more > 0 ? `${shown} +${more}` : shown,
      detail: [this.state.t('panel.tpl.count', { n: t.slots.length }), min].filter(Boolean).join(' · '),
      unavailable: !templateAvailability(t, this.ctx()).available,
      template: t,
    };
  }

  protected readonly builtins = computed(() => BUILTIN_TEMPLATES.all.map((t) => this.card(t)));
  protected readonly mine = computed(() => [...this.data.templates()].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt).map((t) => this.card(t)));

  private nextOrder(): number {
    return this.data.templates().reduce((m, t) => Math.max(m, t.order), 0) + 1;
  }

  protected create(): void {
    const now = Date.now();
    this.editing.set({ template: { id: createId(), name: '', slots: [], format: 'sequence', order: this.nextOrder(), createdAt: now, updatedAt: now }, isNew: true });
  }

  protected duplicate(card: Card): void {
    const now = Date.now();
    const { template } = card;
    const copy: SportTemplate = {
      id: createId(),
      name: this.state.t('panel.tpl.copyName', { name: card.name }),
      slots: template.slots.map((s) => ({ ...s })),
      format: template.format,
      order: this.nextOrder(),
      createdAt: now,
      updatedAt: now,
    };
    if (template.workSeconds !== undefined) copy.workSeconds = template.workSeconds;
    if (template.restSeconds !== undefined) copy.restSeconds = template.restSeconds;
    if (template.minSeconds !== undefined) copy.minSeconds = template.minSeconds;
    this.editing.set({ template: copy, isNew: true });
  }

  protected edit(card: Card): void {
    this.editing.set({ template: card.template, isNew: false });
  }

  protected closeEditor(): void {
    this.editing.set(null);
  }

  protected askDelete(id: string): void {
    this.deletingId.set(id);
    afterNextRender(() => this.deleteButton()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  protected keep(): void {
    this.deletingId.set(null);
  }

  protected remove(id: string): void {
    this.deletingId.set(null);
    this.data.removeTemplate(id);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.deletingId()) {
      event.stopPropagation();
      this.keep();
    }
  }

}
