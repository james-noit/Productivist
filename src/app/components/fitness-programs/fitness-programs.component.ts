import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { GOALS } from '../../../lib/sportask/goals';
import type { AnyGoal, ProgramDef } from '../../../lib/sportask/engine/context';
import { programEntry, withGoalTexts, withProgram } from '../../../lib/sportask/overlay/program-edit';
import { PARAM_ENUMS, PATTERNS, isNewId } from '../../../lib/sportask/overlay/types';
import { PARAM_LIMITS, paramSchema } from '../../../lib/sportask/overlay/validate';
import type { LocalizedText } from '../../../types/sportask';
import { FitnessEditorState } from '../fitness-view/fitness-editor.state';
import { FitnessTextPairComponent } from '../fitness-text-pair/fitness-text-pair.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

type Params = Record<string, unknown>;
interface ParamField {
  key: string;
  kind: 'number' | 'bool' | 'range' | 'patterns' | 'enum';
  value: unknown;
  min: number;
  max: number;
  step: number;
  options: readonly string[];
  /** Not every base phase has it (like `emomFromSeconds`): it can be taken out again. */
  optional: boolean;
}

/** Programs and phases: the weeks, days a week, assessment weeks and, per phase, the parameters the goal's generator is driven by. */
@Component({
  selector: 'app-fitness-programs',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent, FitnessTextPairComponent],
  host: { class: 'fd-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fitness-programs.component.html',
  styleUrl: './fitness-programs.component.css',
})
export class FitnessProgramsComponent {
  protected readonly state = inject(FitnessEditorState);
  private readonly translate = inject(TranslateService);
  protected readonly patterns = PATTERNS;
  protected readonly confirmDelete = signal(false);

  private readonly baseGoals = new Map(GOALS.base.map((g) => [g.id, g]));

  /** One row per program of every goal, in the goal's order. */
  protected readonly rows = computed(() => {
    const entries = this.state.overlay().goals ?? [];
    return this.state.content().goals.all.flatMap((g) =>
      g.programs.map((p) => {
        const entry = entries.find((e) => e.id === g.id);
        const builtin = !!this.baseGoals.get(g.id)?.programs.some((b) => b.id === p.id);
        return { goal: g, program: p, key: `${g.id}/${p.id}`, builtin, changed: builtin && !!entry?.programs?.some((x) => x.id === p.id) };
      }),
    );
  });

  protected readonly key = computed(() => this.state.selected('programs'));
  protected readonly current = computed(() => {
    const key = this.key();
    return this.rows().find((r) => r.key === key) ?? null;
  });
  protected readonly baseProgram = computed(() => {
    const c = this.current();
    return c ? this.baseGoals.get(c.goal.id)?.programs.find((p) => p.id === c.program.id) : undefined;
  });
  protected readonly goalChanged = computed(() => {
    const c = this.current();
    const e = c ? this.state.entry('goals', c.goal.id) : undefined;
    return !!e && (!!e.name || !!e.description);
  });
  protected readonly published = computed(() => {
    const c = this.current();
    return !!c && !!this.state.published()?.overlay.goals?.some((g) => g.id === c.goal.id && g.programs?.some((p) => p.id === c.program.id));
  });
  protected readonly problems = computed(() => {
    const key = this.key();
    const goalId = this.current()?.goal.id;
    return this.state.issues().filter((i) => i.section === 'goals' && (i.id === key || i.id === goalId));
  });
  protected readonly assessments = computed(() => this.state.content().catalog.assessments.all);

  protected readonly phases = computed(() => {
    const c = this.current();
    if (!c) return [];
    const schema = paramSchema(this.baseGoals.get(c.goal.id)!);
    return c.program.phases.map((phase, index) => {
      const params = { ...(phase.params as Params) };
      delete params['warmup'];
      const fields = Object.keys(schema.sample)
        .filter((k) => k in params)
        .map((k) => this.fieldFor(k, schema.sample[k], params[k], !schema.required.has(k)));
      const missing = Object.keys(schema.sample).filter((k) => !(k in params));
      return { index, from: phase.fromWeek, to: phase.toWeek, note: phase.note, fields, missing };
    });
  });

  private fieldFor(key: string, sample: unknown, value: unknown, optional: boolean): ParamField {
    const [min, max] = PARAM_LIMITS[key] ?? [0, 10_000];
    const step = key === 'repsScale' || key === 'tempoFactor' ? 0.1 : 1;
    const kind: ParamField['kind'] = typeof sample === 'number' ? 'number' : typeof sample === 'boolean' ? 'bool' : typeof sample === 'string' ? 'enum' : Array.isArray(sample) ? 'patterns' : 'range';
    return { key, kind, value, min, max, step, options: PARAM_ENUMS[key] ?? [], optional };
  }

  protected label(key: string): string {
    const full = `fitness.param.${key}`;
    this.state.t('title'); // re-read on a language switch
    const text = this.translate.instant(full) as string;
    return text === full ? key : text;
  }

  protected hint(key: string): string {
    const full = `fitness.paramHint.${key}`;
    const text = this.translate.instant(full) as string;
    return text === full ? '' : text;
  }

  protected select(key: string): void {
    this.state.select('programs', key);
    this.confirmDelete.set(false);
  }

  // ---- writing

  private write(full: ProgramDef<unknown>): void {
    const c = this.current();
    if (!c) return;
    this.state.overlay.update((o) => withProgram(o, c.goal.id, full.id, programEntry(this.baseProgram(), full)));
    this.state.notice.set(null);
  }

  protected edit(changes: Partial<ProgramDef<unknown>>): void {
    const c = this.current();
    if (c) this.write({ ...c.program, ...changes });
  }

  protected setText(field: 'name' | 'summary', value: LocalizedText | undefined): void {
    if (value) this.edit({ [field]: value });
  }

  protected setGoalText(field: 'name' | 'description', value: LocalizedText | undefined): void {
    const c = this.current();
    if (!c || !value) return;
    const e = this.state.entry('goals', c.goal.id);
    this.state.overlay.update((o) => withGoalTexts(o, c.goal.id, { ...(e?.name ? { name: e.name } : {}), ...(e?.description ? { description: e.description } : {}), [field]: value }));
  }

  protected resetGoal(): void {
    const c = this.current();
    if (c) this.state.overlay.update((o) => withGoalTexts(o, c.goal.id, {}));
  }

  protected setInt(field: 'weeks' | 'daysPerWeek', event: Event): void {
    const c = this.current();
    const n = Math.round(Number((event.target as HTMLInputElement).value));
    if (!c || !Number.isFinite(n)) return;
    if (field === 'weeks') {
      // The phases keep covering the whole program: the ones past the new end go, the last one stretches to it.
      const kept = c.program.phases.filter((p) => p.fromWeek <= n).map((p) => ({ ...p, toWeek: Math.min(p.toWeek, n) }));
      if (kept.length > 0) kept[kept.length - 1] = { ...kept[kept.length - 1]!, toWeek: n };
      this.edit({ weeks: n, phases: kept, assessmentWeeks: c.program.assessmentWeeks.filter((w) => w <= n) });
    } else this.edit({ daysPerWeek: n });
  }

  protected setAssessmentWeeks(event: Event): void {
    const weeks = [...new Set((event.target as HTMLInputElement).value.split(/[\s,;]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1))].sort((a, b) => a - b);
    this.edit({ assessmentWeeks: weeks });
  }

  protected toggleAssessment(id: string): void {
    const c = this.current();
    if (!c) return;
    const ids = c.program.assessmentIds;
    this.edit({ assessmentIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  }

  protected reset(): void {
    const c = this.current();
    const base = this.baseProgram();
    if (c && base) this.state.overlay.update((o) => withProgram(o, c.goal.id, base.id, null));
  }

  protected duplicate(): void {
    const c = this.current();
    if (!c) return;
    const taken = new Set(c.goal.programs.map((p) => p.id));
    let id = `fd-${c.program.id.replace(/^fd-/, '')}Copy`.slice(0, 56);
    for (let n = 2; taken.has(id); n++) id = `fd-${c.program.id.replace(/^fd-/, '')}Copy${n}`.slice(0, 60);
    const copy: ProgramDef<unknown> = {
      ...c.program,
      id,
      name: { en: `${c.program.name.en} (copy)`, es: `${c.program.name.es} (copia)` },
      phases: c.program.phases.map((p) => ({ ...p, params: { ...(p.params as Params) } })),
    };
    this.state.overlay.update((o) => withProgram(o, c.goal.id, id, programEntry(undefined, copy)));
    this.select(`${c.goal.id}/${id}`);
  }

  protected remove(): void {
    const c = this.current();
    if (!c) return;
    this.state.overlay.update((o) => withProgram(o, c.goal.id, c.program.id, null));
    this.state.select('programs', null);
    this.confirmDelete.set(false);
  }

  // ---- phases

  private writePhases(phases: ProgramDef<unknown>['phases']): void {
    this.edit({ phases });
  }

  protected setPhaseWeek(index: number, field: 'fromWeek' | 'toWeek', event: Event): void {
    const c = this.current();
    const n = Math.round(Number((event.target as HTMLInputElement).value));
    if (!c || !Number.isFinite(n)) return;
    this.writePhases(c.program.phases.map((p, i) => (i === index ? { ...p, [field]: n } : p)));
  }

  protected setPhaseNote(index: number, note: LocalizedText | undefined): void {
    const c = this.current();
    if (!c) return;
    this.writePhases(c.program.phases.map((p, i) => (i === index ? { ...p, ...(note && (note.en || note.es) ? { note } : { note: undefined }) } : p)));
  }

  private setParam(index: number, key: string, value: unknown): void {
    const c = this.current();
    if (!c) return;
    this.writePhases(c.program.phases.map((p, i) => (i === index ? { ...p, params: { ...(p.params as Params), [key]: value } } : p)));
  }

  protected setNumber(index: number, key: string, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n)) this.setParam(index, key, n);
  }

  protected setRange(index: number, key: string, part: 'min' | 'max', current: unknown, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n)) this.setParam(index, key, { ...(current as Record<string, number>), [part]: n });
  }

  protected setBool(index: number, key: string, current: unknown): void {
    this.setParam(index, key, !current);
  }

  protected setEnum(index: number, key: string, event: Event): void {
    this.setParam(index, key, (event.target as HTMLSelectElement).value);
  }

  protected togglePattern(index: number, key: string, current: unknown, pattern: string): void {
    const list = (current as string[]) ?? [];
    this.setParam(index, key, list.includes(pattern) ? list.filter((x) => x !== pattern) : [...list, pattern]);
  }

  protected addParam(index: number, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const key = select.value;
    select.value = '';
    const c = this.current();
    if (!key || !c) return;
    const sample = paramSchema(this.baseGoals.get(c.goal.id)!).sample[key];
    this.setParam(index, key, structuredClone(sample));
  }

  protected removeParam(index: number, key: string): void {
    const c = this.current();
    if (!c) return;
    this.writePhases(
      c.program.phases.map((p, i) => {
        if (i !== index) return p;
        const params = { ...(p.params as Params) };
        delete params[key];
        return { ...p, params };
      }),
    );
  }

  protected addPhase(): void {
    const c = this.current();
    if (!c) return;
    const phases = c.program.phases;
    const last = phases[phases.length - 1]!;
    // Split the last phase at its final week (or, with a single week, nothing to do).
    if (last.toWeek <= last.fromWeek) return;
    this.writePhases([...phases.slice(0, -1), { ...last, toWeek: last.toWeek - 1 }, { ...last, fromWeek: last.toWeek, params: { ...(last.params as Params) }, note: undefined }]);
  }

  protected removePhase(index: number): void {
    const c = this.current();
    if (!c || c.program.phases.length <= 1) return;
    const phases = c.program.phases.map((p) => ({ ...p }));
    const [gone] = phases.splice(index, 1);
    // The neighbour stretches over the weeks that were the removed phase's, so the weeks stay covered.
    if (index > 0) phases[index - 1]!.toWeek = gone!.toWeek;
    else phases[0]!.fromWeek = gone!.fromWeek;
    this.writePhases(phases);
  }

  protected has(list: unknown, item: string): boolean {
    return Array.isArray(list) && list.includes(item);
  }

  protected isNew(id: string): boolean {
    return isNewId(id);
  }

  protected asRange(value: unknown): Record<string, number> {
    return (value ?? {}) as Record<string, number>;
  }

  protected goalOf(goal: AnyGoal): string {
    return this.state.loc(goal.name);
  }
}
