import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CATALOG } from '../../../lib/sportask/catalog';
import { stable } from '../../../lib/sportask/overlay/edit';
import { FitnessEditorState } from '../fitness-view/fitness-editor.state';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/** The progressions: for each movement pattern, the rungs in order of difficulty with alternatives of similar difficulty on each. */
@Component({
  selector: 'app-fitness-ladders',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
  host: { class: 'fd-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fitness-ladders.component.html',
  styleUrl: './fitness-ladders.component.css',
})
export class FitnessLaddersComponent {
  protected readonly state = inject(FitnessEditorState);
  private readonly baseById = new Map(CATALOG.ladders.base.map((l) => [l.id, l]));

  protected readonly rows = computed(() => {
    const changed = new Set((this.state.overlay().ladders ?? []).map((l) => l.id));
    return this.state.content().catalog.ladders.all.map((l) => ({ ladder: l, changed: changed.has(l.id) }));
  });
  protected readonly id = computed(() => this.state.selected('ladders'));
  protected readonly ladder = computed(() => {
    const id = this.id();
    return id ? this.state.content().catalog.ladders.get(id) : undefined;
  });
  protected readonly changed = computed(() => !!this.id() && !!this.state.entry('ladders', this.id()!));
  protected readonly problems = computed(() => this.state.issues().filter((i) => i.section === 'ladders' && i.id === this.id()));

  /** The rungs with the exercises resolved, for display. */
  protected readonly rungs = computed(() => {
    const l = this.ladder();
    if (!l) return [];
    const exercises = this.state.content().catalog.exercises;
    return l.rungs.map((rung) => rung.map((id) => ({ id, ex: exercises.get(id) })));
  });

  /** Exercises that could still be added to a rung: same pattern, not retired, not already on the ladder. */
  protected readonly addable = computed(() => {
    const l = this.ladder();
    if (!l) return [];
    const used = new Set(l.rungs.flat());
    return this.state.content().catalog.exercises.all
      .filter((e) => e.pattern === l.pattern && !e.retired && !used.has(e.id))
      .map((e) => ({ id: e.id, name: this.state.loc(e.name) || e.id, level: e.level }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  });

  protected select(id: string): void {
    this.state.select('ladders', id);
  }

  private set(rungs: string[][]): void {
    const l = this.ladder();
    if (!l) return;
    const base = this.baseById.get(l.id);
    if (base && stable(base.rungs) === stable(rungs)) this.state.clearEntry('ladders', l.id);
    else this.state.setEntry('ladders', { id: l.id, rungs });
  }

  private rungsCopy(): string[][] {
    return (this.ladder()?.rungs ?? []).map((r) => [...r]);
  }

  protected addTo(rung: number, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const id = select.value;
    select.value = '';
    if (!id) return;
    const rungs = this.rungsCopy();
    rungs[rung] = [...(rungs[rung] ?? []), id];
    this.set(rungs);
  }

  protected removeFrom(rung: number, id: string): void {
    const rungs = this.rungsCopy();
    rungs[rung] = (rungs[rung] ?? []).filter((x) => x !== id);
    this.set(rungs);
  }

  protected addRung(): void {
    const rungs = this.rungsCopy();
    if (rungs.length < 12) this.set([...rungs, []]);
  }

  protected removeRung(rung: number): void {
    this.set(this.rungsCopy().filter((_, i) => i !== rung));
  }

  protected moveRung(rung: number, by: -1 | 1): void {
    const rungs = this.rungsCopy();
    const to = rung + by;
    if (to < 0 || to >= rungs.length) return;
    [rungs[rung], rungs[to]] = [rungs[to]!, rungs[rung]!];
    this.set(rungs);
  }

  protected reset(): void {
    const id = this.id();
    if (id) this.state.clearEntry('ladders', id);
  }
}
