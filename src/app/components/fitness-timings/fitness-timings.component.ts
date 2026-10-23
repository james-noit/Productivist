import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CADENCES } from '../../../lib/sportask/cadences';
import { newItemId, patchEntry } from '../../../lib/sportask/overlay/edit';
import type { CadenceEntry } from '../../../lib/sportask/overlay/types';
import type { CadencePreset, LocalizedText } from '../../../types/sportask';
import { FitnessEditorState } from '../fitness-view/fitness-editor.state';
import { FitnessTextPairComponent } from '../fitness-text-pair/fitness-text-pair.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

const KEYS = ['name', 'focusSeconds', 'breakSeconds', 'exerciseEvery', 'longBreak'] as const;
const shape = (c: CadencePreset): CadenceEntry => ({
  id: c.id,
  name: c.name,
  focusSeconds: c.focusSeconds,
  breakSeconds: c.breakSeconds,
  exerciseEvery: c.exerciseEvery,
  ...(c.longBreak ? { longBreak: c.longBreak } : {}),
});

/** Timings: the cadences a user picks from (focus, break, long break, how often a break carries exercise). */
@Component({
  selector: 'app-fitness-timings',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent, FitnessTextPairComponent],
  host: { class: 'fd-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fitness-timings.component.html',
  styleUrl: './fitness-timings.component.css',
})
export class FitnessTimingsComponent {
  protected readonly state = inject(FitnessEditorState);
  private readonly injector = inject(Injector);
  protected readonly creating = signal<{ from: CadencePreset | null; en: string; es: string } | null>(null);
  protected readonly confirmDelete = signal(false);
  private readonly newName = viewChild<ElementRef<HTMLInputElement>>('newName');
  private readonly baseById = new Map(CADENCES.base.map((c) => [c.id, c]));

  protected readonly rows = computed(() => {
    const changed = new Set((this.state.overlay().cadences ?? []).map((c) => c.id));
    return this.state.content().cadences.all.map((c) => ({ c, builtin: this.baseById.has(c.id), changed: changed.has(c.id) }));
  });
  protected readonly id = computed(() => this.state.selected('timings'));
  protected readonly cadence = computed(() => (this.id() ? this.state.content().cadences.get(this.id()!) : undefined));
  protected readonly base = computed(() => (this.id() ? this.baseById.get(this.id()!) : undefined));
  protected readonly changed = computed(() => !!this.base() && !!this.id() && !!this.state.entry('cadences', this.id()!));
  protected readonly published = computed(() => !!this.id() && !!this.state.published()?.overlay.cadences?.some((c) => c.id === this.id()));
  protected readonly problems = computed(() => this.state.issues().filter((i) => i.section === 'cadences' && i.id === this.id()));

  protected minutes(seconds: number): string {
    return String(Math.round((seconds / 60) * 10) / 10);
  }

  /** "25 min focus, 5 min break; every 4th break 15 min; exercise every break". */
  protected summary(c: CadencePreset): string {
    const parts = [this.state.t('tim.summary', { focus: this.minutes(c.focusSeconds), brk: this.minutes(c.breakSeconds) })];
    if (c.longBreak) parts.push(this.state.t('tim.summaryLong', { every: c.longBreak.every, min: this.minutes(c.longBreak.seconds) }));
    parts.push(this.state.t(c.exerciseEvery === 1 ? 'tim.summaryEvery1' : 'tim.summaryEveryN', { n: c.exerciseEvery }));
    return parts.join('; ');
  }

  protected select(id: string): void {
    this.state.select('timings', id);
    this.confirmDelete.set(false);
  }

  protected startCreate(from: CadencePreset | null): void {
    this.creating.set({ from, en: from ? `${from.name.en} (copy)` : '', es: from ? `${from.name.es} (copia)` : '' });
    afterNextRender(() => this.newName()?.nativeElement.focus(), { injector: this.injector });
  }

  protected createValid(): boolean {
    const c = this.creating();
    return !!c && c.en.trim().length > 0 && c.es.trim().length > 0;
  }

  protected create(): void {
    const c = this.creating();
    if (!c || !this.createValid()) return;
    const id = newItemId(c.en, new Set(this.state.content().cadences.all.map((x) => x.id)), 'cadence');
    const from = c.from ?? { id: '', name: { en: '', es: '' }, focusSeconds: 1500, breakSeconds: 300, exerciseEvery: 1 };
    const full: CadencePreset = { ...from, id, name: { en: c.en.trim(), es: c.es.trim() } };
    const entry = patchEntry<CadenceEntry>(undefined, shape(full), KEYS);
    if (entry) this.state.setEntry('cadences', entry);
    this.creating.set(null);
    this.select(id);
  }

  protected resetToBuiltin(): void {
    const id = this.id();
    if (id) this.state.clearEntry('cadences', id);
  }

  protected remove(): void {
    const id = this.id();
    if (!id) return;
    this.state.clearEntry('cadences', id);
    this.state.select('timings', null);
    this.confirmDelete.set(false);
  }

  private write(full: CadencePreset): void {
    const entry = patchEntry<CadenceEntry>(this.base() ? shape(this.base()!) : undefined, shape(full), KEYS);
    if (!entry) {
      this.state.clearEntry('cadences', full.id);
      return;
    }
    // Taking the long break out of a built-in preset is written as an explicit null (a missing key would keep it).
    if (this.base()?.longBreak && !full.longBreak) entry.longBreak = null;
    this.state.setEntry('cadences', entry);
  }

  protected edit(changes: Partial<CadencePreset>): void {
    const c = this.cadence();
    if (!c) return;
    const full = { ...c, ...changes };
    if (!full.longBreak) delete full.longBreak;
    this.write(full);
  }

  protected setName(name: LocalizedText | undefined): void {
    if (name) this.edit({ name });
  }

  protected setMinutes(field: 'focusSeconds' | 'breakSeconds', event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n)) this.edit({ [field]: Math.round(n * 60) });
  }

  protected setEvery(event: Event): void {
    const n = Math.round(Number((event.target as HTMLInputElement).value));
    if (Number.isFinite(n)) this.edit({ exerciseEvery: n });
  }

  protected toggleLong(): void {
    const c = this.cadence();
    if (c) this.edit({ longBreak: c.longBreak ? undefined : { every: 4, seconds: 900 } });
  }

  protected setLong(field: 'every' | 'seconds', event: Event): void {
    const c = this.cadence();
    const raw = (event.target as HTMLInputElement).value;
    const n = Number(raw);
    if (!c?.longBreak || raw.trim() === '' || !Number.isFinite(n)) return;
    this.edit({ longBreak: { ...c.longBreak, [field]: field === 'every' ? Math.round(n) : Math.round(n * 60) } });
  }

  protected setCreating(field: 'en' | 'es', event: Event): void {
    this.creating.update((c) => (c ? { ...c, [field]: (event.target as HTMLInputElement).value } : c));
  }
}
