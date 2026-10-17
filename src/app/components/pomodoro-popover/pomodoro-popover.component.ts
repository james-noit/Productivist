import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector, afterNextRender, computed, inject, output, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { trapTab } from '../../../lib/focus-trap';
import { ClockService } from '../../../services/clock.service';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { MultitaskService } from '../../../services/multitask.service';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import { IconComponent } from '../icon/icon.component';

/** At most this many task titles are listed in Multitask before "+N more". */
const TITLES_SHOWN = 5;

/**
 * The details popover of the header's Pomodoro chip (lazy): phase and state, the time and a progress bar, the current
 * task (or, in Multitask, the effectivity and the lot or the cards' tasks), Pause / Resume, Reset, Mark task done and a
 * way back to the Pomodoro view. Non-modal `role="dialog"` under the chip: focus goes to its first button, Escape
 * and a press outside close it (`closed` emits whether focus should return to the chip), Tab stays inside.
 */
@Component({
  selector: 'app-pomodoro-popover',
  standalone: true,
  imports: [TranslatePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pomodoro-popover.component.html',
  styleUrl: './pomodoro-popover.component.css',
})
export class PomodoroPopoverComponent {
  readonly clock = inject(ClockService);
  readonly multitask = inject(MultitaskService);
  private readonly todos = inject(TodosService);
  private readonly plan = inject(DailyPlanService);
  private readonly projects = inject(ProjectsService);
  private readonly view = inject(ViewService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');

  /** `true` = give focus back to the chip. */
  readonly closed = output<boolean>();

  /** Share of the session already gone, 0..100. */
  readonly progress = computed(() => {
    const total = this.clock.totalSeconds();
    return total > 0 ? Math.min(100, Math.max(0, Math.round((1 - this.clock.remainingSeconds() / total) * 100))) : 0;
  });

  readonly task = computed(() => {
    const todo = this.todos.currentTask();
    if (!todo) return null;
    const project = todo.projectId ? (this.projects.projects().find((p) => p.id === todo.projectId) ?? null) : null;
    return { id: todo.id, title: todo.title, project };
  });

  readonly effectivity = computed(() => {
    const value = this.multitask.efficiency();
    return value === null ? null : Math.round(value * 100);
  });

  private readonly titleById = computed(() => new Map(this.todos.todos().map((t) => [t.id, t.title])));

  /** The plan's active lot ("Lot 2/3"), when the plan has lots. */
  readonly lot = computed(() => {
    const lots = this.plan.executionLots();
    if (!lots.length) return null;
    const index = Math.min(this.plan.activeLotIndex(), lots.length - 1);
    return { n: index + 1, m: lots.length, taskIds: lots[index].taskIds };
  });

  /** Titles of the active lot's tasks, or of the cards' tasks when there are no lots; capped, with how many are left out. */
  readonly listed = computed(() => {
    const titles = this.titleById();
    const ids = this.lot()?.taskIds ?? this.multitask.cards().flatMap((card) => (card.taskId ? [card.taskId] : []));
    const all = ids.flatMap((id) => (titles.has(id) ? [titles.get(id)!] : []));
    return { shown: all.slice(0, TITLES_SHOWN), more: Math.max(0, all.length - TITLES_SHOWN) };
  });

  constructor() {
    afterNextRender(() => this.firstControl()?.focus());
  }

  private firstControl(): HTMLElement | null {
    return this.root().nativeElement.querySelector<HTMLElement>('button');
  }

  toggleRun(): void {
    if (this.clock.running()) this.clock.pause();
    else this.clock.start();
  }

  /** Completes the task and leaves the timer alone; the button goes away with the task, so focus moves to the dialog. */
  markDone(id: string): void {
    this.todos.toggleDone(id);
    afterNextRender(() => this.root().nativeElement.focus(), { injector: this.injector });
  }

  back(): void {
    this.view.setView('pomodoro');
    this.closed.emit(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closed.emit(true);
      return;
    }
    trapTab(event, this.root().nativeElement);
  }

  /** A press outside closes it; the chip itself (the popover's sibling in the same anchor) toggles it instead. */
  @HostListener('document:pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    const anchor = this.host.nativeElement.parentElement;
    if (!anchor?.contains(event.target as Node)) this.closed.emit(false);
  }
}
