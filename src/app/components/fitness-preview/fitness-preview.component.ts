import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { contentFor } from '../../../lib/sportask/overlay/merge';
import { type PreviewOptions, previewBlock } from '../../../lib/sportask/overlay/preview';
import type { GeneratedBlock } from '../../../lib/sportask/engine/generate';
import type { BlockStep } from '../../../types/sportask';
import { FitnessEditorState } from '../fitness-view/fitness-editor.state';
import { SportaskPictogramComponent } from '../sportask-pictogram/sportask-pictogram.component';

const LENGTHS = [30, 60, 90, 120, 300, 600, 900, 1500];
const BUILTIN = { value: null as ReturnType<typeof contentFor> | null };

interface Row {
  index: number;
  name: string;
  pictogram: string;
  work: number;
  rest: number;
  target: string;
  side: string;
  round: number | null;
  loadKg: number | null;
}

/** "Preview what a user gets": the real generator over the draft, for one hypothetical user and one break, with a built-in comparison. */
@Component({
  selector: 'app-fitness-preview',
  standalone: true,
  imports: [TranslatePipe, SportaskPictogramComponent],
  host: { class: 'fd-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fitness-preview.component.html',
  styleUrl: './fitness-preview.component.css',
})
export class FitnessPreviewComponent {
  protected readonly state = inject(FitnessEditorState);
  protected readonly lengths = LENGTHS;
  protected readonly levels = [1, 2, 3] as const;

  protected readonly mode = signal<'goal' | 'free'>('goal');
  private readonly goalPick = signal('');
  private readonly programPick = signal('');
  protected readonly week = signal(1);
  protected readonly level = signal<1 | 2 | 3>(1);
  private readonly templatePick = signal('');
  protected readonly length = signal(300);
  protected readonly gear = signal<'none' | 'all'>('all');
  protected readonly lowImpact = signal(false);
  protected readonly noFloor = signal(false);
  protected readonly afterBlock = signal(false);
  protected readonly seed = signal(1);
  protected readonly compare = signal(false);

  protected readonly goals = computed(() => this.state.content().goals.all);
  protected readonly goalId = computed(() => (this.goals().some((g) => g.id === this.goalPick()) ? this.goalPick() : (this.goals()[0]?.id ?? '')));
  protected readonly goal = computed(() => this.goals().find((g) => g.id === this.goalId()));
  protected readonly programs = computed(() => this.goal()?.programs ?? []);
  protected readonly programId = computed(() => (this.programs().some((p) => p.id === this.programPick()) ? this.programPick() : (this.programs()[0]?.id ?? '')));
  protected readonly program = computed(() => this.programs().find((p) => p.id === this.programId()));
  protected readonly weekNumbers = computed(() => Array.from({ length: this.program()?.weeks ?? 1 }, (_, i) => i + 1));
  protected readonly weekShown = computed(() => Math.min(this.week(), this.program()?.weeks ?? 1));
  protected readonly templates = computed(() => this.state.content().templates.all);
  protected readonly templateId = computed(() => (this.templates().some((t) => t.id === this.templatePick()) ? this.templatePick() : ''));

  private readonly options = computed<PreviewOptions>(() => ({
    mode: this.mode(),
    goalId: this.goalId(),
    programId: this.programId(),
    week: this.weekShown(),
    level: this.level(),
    templateId: this.templateId() || null,
    blockSeconds: this.length(),
    gear: this.gear(),
    constraints: { lowImpact: this.lowImpact(), noFloor: this.noFloor() },
    afterBlock: this.afterBlock(),
    seed: this.seed(),
  }));

  protected readonly draftBlock = computed(() => this.run(this.state.content()));
  protected readonly builtinBlock = computed(() => {
    if (!this.compare()) return null;
    BUILTIN.value ??= contentFor(null);
    return this.run(BUILTIN.value);
  });

  private run(content: ReturnType<typeof contentFor>): { block: GeneratedBlock | null; rows: Row[]; error: boolean } {
    try {
      const block = previewBlock(content, this.options());
      return { block, rows: block.plan.steps.map((s, i) => this.row(content, s, i)), error: false };
    } catch {
      return { block: null, rows: [], error: true };
    }
  }

  private row(content: ReturnType<typeof contentFor>, step: BlockStep, index: number): Row {
    const ex = content.catalog.exercises.get(step.exerciseId);
    const target = step.target?.reps !== undefined ? `${step.target.reps} ${this.state.s('panel.unit.reps')}` : step.target?.seconds !== undefined ? `${step.target.seconds} s` : '';
    return {
      index,
      name: this.state.loc(ex?.name) || step.exerciseId,
      pictogram: ex?.pictogram ?? 'march',
      work: step.workSeconds,
      rest: step.restSeconds,
      target,
      side: step.side ? this.state.s(`panel.g.${step.side}`) : '',
      round: step.round ?? null,
      loadKg: step.loadKg ?? null,
    };
  }

  protected setMode(mode: 'goal' | 'free'): void {
    this.mode.set(mode);
  }

  protected pick(field: 'goal' | 'program' | 'template', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (field === 'goal') {
      this.goalPick.set(value);
      this.programPick.set('');
    } else if (field === 'program') this.programPick.set(value);
    else this.templatePick.set(value);
  }

  protected num(field: 'week' | 'length', event: Event): void {
    const n = Number((event.target as HTMLSelectElement).value);
    if (!Number.isFinite(n)) return;
    if (field === 'week') this.week.set(n);
    else this.length.set(n);
  }

  protected roll(): void {
    this.seed.update((n) => n + 1);
  }

  protected minutes(seconds: number): string {
    return seconds >= 120 ? `${Math.round(seconds / 6) / 10} min` : `${seconds} s`;
  }
}
