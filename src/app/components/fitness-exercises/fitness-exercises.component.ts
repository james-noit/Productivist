import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CATALOG, MET, PICTOGRAM_IDS } from '../../../lib/sportask/catalog';
import { exerciseEntry, newItemId } from '../../../lib/sportask/overlay/edit';
import { IMPACTS, PATTERNS, TAGS, ZONES, isNewId } from '../../../lib/sportask/overlay/types';
import { normalizeQuery } from '../../../lib/search';
import type { ExerciseDef, Impact, Level, LocalizedText } from '../../../types/sportask';
import { FitnessEditorState } from '../fitness-view/fitness-editor.state';
import { FitnessTextPairComponent } from '../fitness-text-pair/fitness-text-pair.component';
import { SportaskPictogramComponent } from '../sportask-pictogram/sportask-pictogram.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

type Filter = 'all' | 'builtin' | 'mine' | 'changed' | 'retired';
const FILTERS: readonly Filter[] = ['all', 'builtin', 'mine', 'changed', 'retired'];

const BLANK: Omit<ExerciseDef, 'id'> = {
  name: { en: '', es: '' },
  cues: [{ en: '', es: '' }],
  pattern: 'core',
  tags: ['strength'],
  metric: 'reps',
  needsOneOf: [],
  level: 1,
  impact: 'none',
  floor: false,
  met: 3.5,
  dose: { reps: 8 },
  pictogram: 'march',
};

/** The exercise library: list, search and filters, create, override, duplicate, retire, and the full form with a live pictogram. */
@Component({
  selector: 'app-fitness-exercises',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent, FitnessTextPairComponent, SportaskPictogramComponent],
  host: { class: 'fd-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fitness-exercises.component.html',
  styleUrl: './fitness-exercises.component.css',
})
export class FitnessExercisesComponent {
  protected readonly state = inject(FitnessEditorState);
  private readonly injector = inject(Injector);

  protected readonly patterns = PATTERNS;
  protected readonly zones = ZONES;
  protected readonly tags = TAGS;
  protected readonly impacts = IMPACTS;
  protected readonly levels: readonly Level[] = [1, 2, 3, 4, 5];
  protected readonly pictograms = PICTOGRAM_IDS;
  protected readonly filters = FILTERS;
  protected readonly metPresets = Object.entries(MET).map(([key, value]) => ({ key, value }));

  protected readonly query = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly creating = signal<{ from: ExerciseDef | null; en: string; es: string } | null>(null);
  protected readonly confirmDelete = signal(false);
  private readonly newName = viewChild<ElementRef<HTMLInputElement>>('newName');

  private readonly baseById = new Map(CATALOG.exercises.base.map((e) => [e.id, e]));

  protected readonly rows = computed(() => {
    const changed = new Set((this.state.overlay().exercises ?? []).filter((e) => this.baseById.has(e.id)).map((e) => e.id));
    const q = normalizeQuery(this.query());
    const f = this.filter();
    return this.state.content().catalog.exercises.all
      .map((ex) => ({ ex, builtin: this.baseById.has(ex.id), changed: changed.has(ex.id), name: this.state.loc(ex.name) }))
      .filter((r) => {
        if (f === 'builtin' && !r.builtin) return false;
        if (f === 'mine' && r.builtin) return false;
        if (f === 'changed' && !r.changed) return false;
        if (f === 'retired' && !r.ex.retired) return false;
        return !q || normalizeQuery(`${r.name} ${r.ex.id} ${r.ex.pattern}`).includes(q);
      });
  });

  protected readonly id = computed(() => this.state.selected('exercises'));
  protected readonly ex = computed(() => {
    const id = this.id();
    return id ? this.state.content().catalog.exercises.get(id) : undefined;
  });
  protected readonly base = computed(() => (this.id() ? this.baseById.get(this.id()!) : undefined));
  protected readonly entry = computed(() => (this.id() ? this.state.entry('exercises', this.id()!) : undefined));
  protected readonly isBuiltin = computed(() => !!this.base());
  /** Fields this exercise overrides, for the "Modified" line. */
  protected readonly overrides = computed(() => (this.isBuiltin() ? Object.keys(this.entry() ?? {}).filter((k) => k !== 'id') : []));
  protected readonly published = computed(() => !!this.id() && !!this.state.published()?.overlay.exercises?.some((e) => e.id === this.id()));
  protected readonly problems = computed(() => this.state.issues().filter((i) => i.section === 'exercises' && i.id === this.id()));

  /** Where the exercise is used: ladders (and rung) and templates. */
  protected readonly usedIn = computed(() => {
    const id = this.id();
    if (!id) return [];
    const content = this.state.content();
    const out: string[] = [];
    for (const l of content.catalog.ladders.all) l.rungs.forEach((rung, i) => rung.includes(id) && out.push(this.state.t('ex.usedLadder', { ladder: l.id, rung: i + 1 })));
    for (const t of content.templates.all) if (t.slots.some((s) => 'exerciseId' in s && s.exerciseId === id)) out.push(this.state.t('ex.usedTemplate', { name: this.state.loc(t.nameText) }));
    return out;
  });

  protected select(id: string): void {
    this.state.select('exercises', id);
    this.confirmDelete.set(false);
  }

  // ---- create / duplicate / delete / retire / reset

  protected startCreate(from: ExerciseDef | null): void {
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
    const taken = new Set(this.state.content().catalog.exercises.all.map((e) => e.id));
    const id = newItemId(c.en, taken, 'exercise');
    const name: LocalizedText = { en: c.en.trim(), es: c.es.trim() };
    const source = c.from ?? { id, ...BLANK };
    const full: ExerciseDef = { ...source, id, name, cues: source.cues.map((x) => ({ ...x })), tags: [...source.tags], needsOneOf: [...source.needsOneOf], dose: { ...source.dose } };
    delete full.retired;
    const entry = exerciseEntry(undefined, full);
    if (entry) this.state.setEntry('exercises', entry);
    this.creating.set(null);
    this.filter.set('all');
    this.query.set('');
    this.select(id);
  }

  protected resetToBuiltin(): void {
    const id = this.id();
    if (id) this.state.clearEntry('exercises', id);
  }

  protected remove(): void {
    const id = this.id();
    if (!id) return;
    this.state.clearEntry('exercises', id);
    this.state.select('exercises', null);
    this.confirmDelete.set(false);
  }

  protected toggleRetired(): void {
    this.update({ retired: !this.ex()?.retired });
  }

  // ---- editing

  protected update(changes: Partial<ExerciseDef>): void {
    const ex = this.ex();
    if (!ex) return;
    const full: ExerciseDef = { ...ex, ...changes };
    const entry = exerciseEntry(this.base(), full);
    if (entry) this.state.setEntry('exercises', entry);
    else this.state.clearEntry('exercises', ex.id);
  }

  protected setName(name: LocalizedText | undefined): void {
    if (name) this.update({ name });
  }

  protected setCue(index: number, cue: LocalizedText | undefined): void {
    const ex = this.ex();
    if (!ex || !cue) return;
    this.update({ cues: ex.cues.map((c, i) => (i === index ? cue : c)) });
  }

  protected addCue(): void {
    const ex = this.ex();
    if (ex && ex.cues.length < 4) this.update({ cues: [...ex.cues, { en: '', es: '' }] });
  }

  protected removeCue(index: number): void {
    const ex = this.ex();
    if (ex) this.update({ cues: ex.cues.filter((_, i) => i !== index) });
  }

  protected setPattern(event: Event): void {
    this.update({ pattern: (event.target as HTMLSelectElement).value as ExerciseDef['pattern'] });
  }

  protected setLevel(level: Level): void {
    this.update({ level });
  }

  protected setImpact(impact: Impact): void {
    this.update({ impact });
  }

  protected setMetric(metric: 'reps' | 'seconds'): void {
    const ex = this.ex();
    if (!ex || ex.metric === metric) return;
    this.update({ metric, dose: metric === 'reps' ? { reps: 8 } : { seconds: 30 } });
  }

  protected setDose(event: Event): void {
    const ex = this.ex();
    const n = Number((event.target as HTMLInputElement).value);
    if (!ex || !Number.isFinite(n)) return;
    this.update({ dose: ex.metric === 'reps' ? { reps: Math.round(n) } : { seconds: Math.round(n) } });
  }

  protected setNumber(field: 'secondsPerRep' | 'met', event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    this.update({ [field]: n } as Partial<ExerciseDef>);
  }

  protected setMetPreset(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (Number.isFinite(value) && value > 0) this.update({ met: value });
    (event.target as HTMLSelectElement).value = '';
  }

  protected toggle<K extends 'zones' | 'tags' | 'needsOneOf'>(field: K, item: string): void {
    const ex = this.ex();
    if (!ex) return;
    const list = (ex[field] ?? []) as string[];
    const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
    this.update({ [field]: next } as Partial<ExerciseDef>);
  }

  protected flag(field: 'perSide' | 'floor' | 'space' | 'wall' | 'chair' | 'loadable'): void {
    const ex = this.ex();
    if (ex) this.update({ [field]: !ex[field] } as Partial<ExerciseDef>);
  }

  protected has(list: readonly string[] | undefined, item: string): boolean {
    return !!list && list.includes(item);
  }

  protected isNew(id: string): boolean {
    return isNewId(id);
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected setFilter(event: Event): void {
    this.filter.set((event.target as HTMLSelectElement).value as Filter);
  }

  protected setCreating(field: 'en' | 'es', event: Event): void {
    this.creating.update((c) => (c ? { ...c, [field]: (event.target as HTMLInputElement).value } : c));
  }
}
