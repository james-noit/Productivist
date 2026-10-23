import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CATALOG } from '../../../lib/sportask/catalog';
import type { AssessmentDef } from '../../../lib/sportask/engine/context';
import { patchEntry } from '../../../lib/sportask/overlay/edit';
import type { AssessmentEntry } from '../../../lib/sportask/overlay/types';
import type { LocalizedText } from '../../../types/sportask';
import { FitnessEditorState } from '../fitness-view/fitness-editor.state';
import { FitnessTextPairComponent } from '../fitness-text-pair/fitness-text-pair.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

const KEYS = ['name', 'instructions', 'seconds', 'exerciseIds', 'maxRung'] as const;
const shape = (a: AssessmentDef): AssessmentEntry => ({
  id: a.id,
  name: a.name,
  instructions: a.instructions,
  seconds: a.seconds,
  ...(a.exerciseIds ? { exerciseIds: a.exerciseIds } : {}),
  ...(a.maxRung !== undefined ? { maxRung: a.maxRung } : {}),
});

/** Assessments (the tests of a program): their texts, how long they last and which exercise performs them. They are edited, not created. */
@Component({
  selector: 'app-fitness-assessments',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent, FitnessTextPairComponent],
  host: { class: 'fd-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fitness-assessments.component.html',
  styleUrl: './fitness-assessments.component.css',
})
export class FitnessAssessmentsComponent {
  protected readonly state = inject(FitnessEditorState);
  private readonly baseById = new Map(CATALOG.assessments.base.map((a) => [a.id, a]));

  protected readonly rows = computed(() => {
    const changed = new Set((this.state.overlay().assessments ?? []).map((a) => a.id));
    return this.state.content().catalog.assessments.all.map((a) => ({ a, changed: changed.has(a.id) }));
  });
  protected readonly id = computed(() => this.state.selected('assessments'));
  protected readonly assessment = computed(() => (this.id() ? this.state.content().catalog.assessments.get(this.id()!) : undefined));
  protected readonly changed = computed(() => !!this.id() && !!this.state.entry('assessments', this.id()!));
  protected readonly problems = computed(() => this.state.issues().filter((i) => i.section === 'assessments' && i.id === this.id()));
  protected readonly ladder = computed(() => {
    const a = this.assessment();
    return a?.ladderId ? this.state.content().catalog.ladders.get(a.ladderId) : undefined;
  });

  /** Exercises the test could use: the same unit as the test, not retired, not already chosen. */
  protected readonly addable = computed(() => {
    const a = this.assessment();
    if (!a?.exerciseIds) return [];
    const chosen = new Set(a.exerciseIds);
    return this.state.content().catalog.exercises.all
      .filter((e) => !e.retired && !chosen.has(e.id) && (a.metric === 'cm' || e.metric === a.metric))
      .map((e) => ({ id: e.id, name: this.state.loc(e.name) || e.id }))
      .sort((x, y) => x.name.localeCompare(y.name));
  });
  protected readonly chosen = computed(() => {
    const a = this.assessment();
    const exercises = this.state.content().catalog.exercises;
    return (a?.exerciseIds ?? []).map((id) => ({ id, name: this.state.loc(exercises.get(id)?.name) || id, retired: !!exercises.get(id)?.retired }));
  });

  protected select(id: string): void {
    this.state.select('assessments', id);
  }

  private write(full: AssessmentDef): void {
    const base = this.baseById.get(full.id);
    const entry = patchEntry<AssessmentEntry>(base ? shape(base) : undefined, shape(full), KEYS);
    if (entry) this.state.setEntry('assessments', entry);
    else this.state.clearEntry('assessments', full.id);
  }

  protected edit(changes: Partial<AssessmentDef>): void {
    const a = this.assessment();
    if (a) this.write({ ...a, ...changes });
  }

  protected setText(field: 'name' | 'instructions', value: LocalizedText | undefined): void {
    if (value) this.edit({ [field]: value });
  }

  protected setNumber(field: 'seconds' | 'maxRung', event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const n = Math.round(Number(raw));
    if (raw.trim() !== '' && Number.isFinite(n)) this.edit({ [field]: n });
  }

  protected addExercise(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const id = select.value;
    select.value = '';
    const a = this.assessment();
    if (id && a?.exerciseIds) this.edit({ exerciseIds: [...a.exerciseIds, id] });
  }

  protected removeExercise(id: string): void {
    const a = this.assessment();
    if (a?.exerciseIds) this.edit({ exerciseIds: a.exerciseIds.filter((x) => x !== id) });
  }

  protected reset(): void {
    const id = this.id();
    if (id) this.state.clearEntry('assessments', id);
  }
}
