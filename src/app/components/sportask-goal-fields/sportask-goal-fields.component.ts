import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { GOALS } from '../../../lib/sportask/goals';
import { type GoalPick, pickFor } from '../../../lib/sportask/setup';
import { localize } from '../../../lib/sportask/texts';
import { SettingsService } from '../../../services/settings.service';
import { UiIconComponent, type UiIconName } from '../ui-icon/ui-icon.component';

const LEVELS: readonly (1 | 2 | 3)[] = [1, 2, 3];
let nextId = 0;

/**
 * The goal block of Configuration > Sportask and of the setup wizard: the goal cards, the program of the chosen goal and the
 * level. Presentational: `value` in, `changed` out. With `allowNone` an extra card means "only free training" and the value
 * is `null`. Needs the Sportask texts loaded by the parent.
 */
@Component({
  selector: 'app-sportask-goal-fields',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-goal-fields.component.html',
  styleUrl: './sportask-goal-fields.component.css',
})
export class SportaskGoalFieldsComponent {
  readonly value = input.required<GoalPick | null>();
  /** Adds the "Only free training" card (value `null`). */
  readonly allowNone = input(false);
  /** The goal the user is enrolled in (a check mark on its card), when the page shows it. */
  readonly enrolledGoalId = input<string | null>(null);
  readonly changed = output<GoalPick | null>();

  protected readonly uid = `sgf${nextId++}`;
  protected readonly levels = LEVELS;
  private readonly lang = inject(SettingsService).language;

  private readonly goal = computed(() => {
    const v = this.value();
    return v ? (GOALS.get(v.goalId) ?? GOALS.all[0]!) : null;
  });

  protected readonly cards = computed(() => {
    const lang = this.lang();
    const selected = this.value()?.goalId;
    const enrolled = this.enrolledGoalId();
    return GOALS.all.map((g) => ({
      id: g.id,
      icon: g.icon as UiIconName,
      name: localize(g.name, lang),
      description: localize(g.description, lang),
      selected: g.id === selected,
      enrolled: g.id === enrolled,
    }));
  });
  protected readonly programs = computed(() => {
    const lang = this.lang();
    return (this.goal()?.programs ?? []).map((p) => ({ id: p.id, name: localize(p.name, lang) }));
  });
  protected readonly programInfo = computed(() => {
    const p = this.goal()?.programs.find((x) => x.id === this.value()?.programId);
    return p ? { summary: localize(p.summary, this.lang()), weeks: p.weeks, days: p.daysPerWeek } : null;
  });

  protected pickGoal(id: string): void {
    const v = this.value();
    if (v?.goalId === id) return;
    this.changed.emit(pickFor(id, undefined, v?.level ?? 1));
  }

  protected pickNone(): void {
    if (this.value() !== null) this.changed.emit(null);
  }

  protected pickProgram(id: string): void {
    const v = this.value();
    if (v) this.changed.emit({ ...v, programId: id });
  }

  protected pickLevel(level: 1 | 2 | 3): void {
    const v = this.value();
    if (v) this.changed.emit({ ...v, level });
  }
}
