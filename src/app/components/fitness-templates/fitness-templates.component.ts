import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { BUILTIN_TEMPLATES } from '../../../lib/sportask/templates';
import { newItemId, patchEntry } from '../../../lib/sportask/overlay/edit';
import { FORMATS, PATTERNS, TAGS, ZONES, type TemplateEntry } from '../../../lib/sportask/overlay/types';
import { normalizeQuery } from '../../../lib/search';
import type { Level, LocalizedText, SportTemplate, TemplateSlot } from '../../../types/sportask';
import { FitnessEditorState } from '../fitness-view/fitness-editor.state';
import { FitnessTextPairComponent } from '../fitness-text-pair/fitness-text-pair.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

const KEYS = ['nameText', 'slots', 'format', 'workSeconds', 'restSeconds', 'minSeconds'] as const;
const shape = (t: SportTemplate): TemplateEntry => ({
  id: t.id,
  nameText: t.nameText ?? { en: t.name, es: t.name },
  slots: t.slots,
  format: t.format,
  ...(t.workSeconds !== undefined ? { workSeconds: t.workSeconds } : {}),
  ...(t.restSeconds !== undefined ? { restSeconds: t.restSeconds } : {}),
  ...(t.minSeconds !== undefined ? { minSeconds: t.minSeconds } : {}),
});

/** Templates for free training: slots (a fixed exercise with a dose, or "any push exercise up to level 2"), format and timings. */
@Component({
  selector: 'app-fitness-templates',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent, FitnessTextPairComponent],
  host: { class: 'fd-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fitness-templates.component.html',
  styleUrl: './fitness-templates.component.css',
})
export class FitnessTemplatesComponent {
  protected readonly state = inject(FitnessEditorState);
  private readonly injector = inject(Injector);
  protected readonly formats = FORMATS;
  protected readonly patterns = PATTERNS;
  protected readonly tags = TAGS;
  protected readonly zones = ZONES;
  protected readonly levels: readonly Level[] = [1, 2, 3, 4, 5];

  protected readonly query = signal('');
  protected readonly creating = signal<{ from: SportTemplate | null; en: string; es: string } | null>(null);
  protected readonly confirmDelete = signal(false);
  private readonly newName = viewChild<ElementRef<HTMLInputElement>>('newName');

  private readonly baseById = new Map(BUILTIN_TEMPLATES.base.map((t) => [t.id, t]));

  protected readonly rows = computed(() => {
    const changed = new Set((this.state.overlay().templates ?? []).map((t) => t.id));
    const q = normalizeQuery(this.query());
    return this.state.content().templates.all
      .map((t) => ({ t, name: this.state.loc(t.nameText), builtin: this.baseById.has(t.id), changed: changed.has(t.id) }))
      .filter((r) => !q || normalizeQuery(`${r.name} ${r.t.id}`).includes(q));
  });
  protected readonly id = computed(() => this.state.selected('templates'));
  protected readonly tpl = computed(() => (this.id() ? this.state.content().templates.get(this.id()!) : undefined));
  protected readonly base = computed(() => (this.id() ? this.baseById.get(this.id()!) : undefined));
  protected readonly changed = computed(() => !!this.base() && !!this.id() && !!this.state.entry('templates', this.id()!));
  protected readonly published = computed(() => !!this.id() && !!this.state.published()?.overlay.templates?.some((t) => t.id === this.id()));
  protected readonly problems = computed(() => this.state.issues().filter((i) => i.section === 'templates' && i.id === this.id()));

  protected readonly exerciseOptions = computed(() =>
    this.state.content().catalog.exercises.all
      .map((e) => ({ id: e.id, name: this.state.loc(e.name) || e.id, metric: e.metric, retired: !!e.retired }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  private readonly metricOf = computed(() => new Map(this.exerciseOptions().map((e) => [e.id, e.metric])));

  /** The slots with what the template needs to draw them. */
  protected readonly slots = computed(() => {
    const t = this.tpl();
    if (!t) return [];
    const metric = this.metricOf();
    return t.slots.map((slot, index) => {
      if ('exerciseId' in slot) {
        const unit = metric.get(slot.exerciseId) ?? 'reps';
        return { index, kind: 'exercise' as const, exerciseId: slot.exerciseId, dose: slot.dose?.reps ?? slot.dose?.seconds ?? null, unit, slot };
      }
      return { index, kind: 'pattern' as const, pattern: slot.pattern, tag: slot.tag ?? '', zone: slot.zone ?? '', maxLevel: slot.maxLevel ?? 0, slot };
    });
  });

  protected select(id: string): void {
    this.state.select('templates', id);
    this.confirmDelete.set(false);
  }

  // ---- create / duplicate / delete / reset

  protected startCreate(from: SportTemplate | null): void {
    this.creating.set({ from, en: from ? `${this.state.loc({ en: from.nameText?.en ?? from.name, es: '' })} (copy)` : '', es: from ? `${from.nameText?.es ?? from.name} (copia)` : '' });
    afterNextRender(() => this.newName()?.nativeElement.focus(), { injector: this.injector });
  }

  protected createValid(): boolean {
    const c = this.creating();
    return !!c && c.en.trim().length > 0 && c.es.trim().length > 0;
  }

  protected create(): void {
    const c = this.creating();
    if (!c || !this.createValid()) return;
    const id = newItemId(c.en, new Set(this.state.content().templates.all.map((t) => t.id)), 'template');
    const source = c.from;
    const full: SportTemplate = {
      id,
      name: c.en.trim(),
      nameText: { en: c.en.trim(), es: c.es.trim() },
      slots: source ? structuredClone(source.slots) : [{ pattern: 'push' }],
      format: source?.format ?? 'sequence',
      ...(source?.workSeconds !== undefined ? { workSeconds: source.workSeconds } : {}),
      ...(source?.restSeconds !== undefined ? { restSeconds: source.restSeconds } : {}),
      minSeconds: source?.minSeconds ?? 60,
      order: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const entry = patchEntry<TemplateEntry>(undefined, shape(full), KEYS);
    if (entry) this.state.setEntry('templates', entry);
    this.creating.set(null);
    this.query.set('');
    this.select(id);
  }

  protected resetToBuiltin(): void {
    const id = this.id();
    if (id) this.state.clearEntry('templates', id);
  }

  protected remove(): void {
    const id = this.id();
    if (!id) return;
    this.state.clearEntry('templates', id);
    this.state.select('templates', null);
    this.confirmDelete.set(false);
  }

  // ---- editing

  private write(changes: Partial<SportTemplate>): void {
    const t = this.tpl();
    if (!t) return;
    const full: SportTemplate = { ...t, ...changes };
    const entry = patchEntry<TemplateEntry>(this.base() ? shape(this.base()!) : undefined, shape(full), KEYS);
    if (entry) this.state.setEntry('templates', entry);
    else this.state.clearEntry('templates', t.id);
  }

  protected setName(name: LocalizedText | undefined): void {
    if (name) this.write({ nameText: name, name: name.en });
  }

  protected setFormat(format: SportTemplate['format']): void {
    this.write({ format });
  }

  protected setSeconds(field: 'workSeconds' | 'restSeconds' | 'minSeconds', event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const n = Math.round(Number(raw));
    if (raw.trim() !== '' && Number.isFinite(n)) this.write({ [field]: n });
  }

  private setSlots(slots: TemplateSlot[]): void {
    this.write({ slots });
  }

  protected replaceSlot(index: number, slot: TemplateSlot): void {
    const t = this.tpl();
    if (t) this.setSlots(t.slots.map((s, i) => (i === index ? slot : s)));
  }

  protected setSlotExercise(index: number, event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const old = this.tpl()?.slots[index];
    if (!id) return;
    // A dose in the other unit would be wrong for the new exercise: it is dropped.
    const dose = old && 'exerciseId' in old && old.dose && this.metricOf().get(old.exerciseId) === this.metricOf().get(id) ? old.dose : undefined;
    this.replaceSlot(index, dose ? { exerciseId: id, dose } : { exerciseId: id });
  }

  protected setSlotDose(index: number, exerciseId: string, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const n = Math.round(Number(raw));
    if (raw.trim() === '') this.replaceSlot(index, { exerciseId });
    else if (Number.isFinite(n) && n >= 1) this.replaceSlot(index, { exerciseId, dose: this.metricOf().get(exerciseId) === 'seconds' ? { seconds: n } : { reps: n } });
  }

  protected setPatternField(index: number, field: 'pattern' | 'tag' | 'zone' | 'maxLevel', current: Extract<TemplateSlot, { pattern: string }>, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const next: Record<string, unknown> = { ...current };
    if (field === 'maxLevel') {
      if (value === '0') delete next['maxLevel'];
      else next['maxLevel'] = Number(value);
    } else if (value === '') delete next[field];
    else next[field] = value;
    this.replaceSlot(index, next as TemplateSlot);
  }

  protected addExerciseSlot(): void {
    const t = this.tpl();
    const first = this.exerciseOptions().find((e) => !e.retired);
    if (t && first && t.slots.length < 40) this.setSlots([...t.slots, { exerciseId: first.id }]);
  }

  protected addPatternSlot(): void {
    const t = this.tpl();
    if (t && t.slots.length < 40) this.setSlots([...t.slots, { pattern: 'push' }]);
  }

  protected moveSlot(index: number, by: -1 | 1): void {
    const t = this.tpl();
    const to = index + by;
    if (!t || to < 0 || to >= t.slots.length) return;
    const slots = [...t.slots];
    [slots[index], slots[to]] = [slots[to]!, slots[index]!];
    this.setSlots(slots);
  }

  protected removeSlot(index: number): void {
    const t = this.tpl();
    if (t) this.setSlots(t.slots.filter((_, i) => i !== index));
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected setCreating(field: 'en' | 'es', event: Event): void {
    this.creating.update((c) => (c ? { ...c, [field]: (event.target as HTMLInputElement).value } : c));
  }
}
