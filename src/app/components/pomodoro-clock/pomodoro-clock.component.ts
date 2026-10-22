import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, Injector, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { ClockService } from '../../../services/clock.service';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { ViewService } from '../../../services/view.service';
import { nextOpenTask, planGroups } from '../../../lib/daily-plan-progress';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { Todo } from '../../../types/todo';
import { SportaskService } from '../../../services/sportask.service';
import { ClockModeBarComponent } from '../clock-mode-bar/clock-mode-bar.component';
import { BoxClockComponent } from '../box-clock/box-clock.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import { TaskProjectTagComponent } from '../task-project-tag/task-project-tag.component';
import { TaskPickerComponent } from '../task-picker/task-picker.component';

const RADIUS = 90;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

@Component({
  selector: 'app-pomodoro-clock',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    ClockModeBarComponent,
    BoxClockComponent,
    TaskDetailModalComponent,
    TaskProjectTagComponent,
    TaskPickerComponent,
    UiIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pomodoro-clock.component.html',
  styleUrl: './pomodoro-clock.component.css',
})
export class PomodoroClockComponent {
  readonly settings = inject(SettingsService);
  readonly todos = inject(TodosService);
  readonly clock = inject(ClockService);
  readonly sportask = inject(SportaskService);
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly view = inject(ViewService);

  readonly radius = RADIUS;
  readonly circumference = CIRCUMFERENCE;

  // Clamped: a phase that was already running when a Sportask session changed the lengths can have more time left than the new total.
  readonly progress = computed(() =>
    this.clock.totalSeconds() === 0 ? 0 : Math.min(1, Math.max(0, 1 - this.clock.remainingSeconds() / this.clock.totalSeconds())),
  );

  readonly dashOffset = computed(() => this.circumference * (1 - this.progress()));


  readonly taskModalOpen = signal(false);
  readonly showDetail = signal(false);
  readonly titleEditing = signal(false);
  readonly editTitle = signal('');

  private readonly injector = inject(Injector);

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  /** The task just finished while a plan is committed; the up-next panel shows while no task is current. */
  readonly justFinished = signal<{ id: string; title: string; objectiveId: string | null } | null>(null);

  /** The committed plan by objective, with live progress. */
  private readonly groups = computed(() =>
    planGroups(
      this.dailyPlan.committedPlannedTaskIds(),
      this.dailyPlan.committedObjectives(),
      this.dailyPlan.committedAssignments(),
      new Map(this.todos.todos().map((t) => [t.id, t.done] as const)),
    ),
  );

  /** taskId -> the committed objective it serves (text and progress), for planned tasks that have one. */
  private readonly objectiveByTask = computed(() => {
    const map = new Map<string, { id: string; text: string; done: number; total: number }>();
    for (const g of this.groups()) {
      if (!g.objective) continue;
      const info = { id: g.objective.id, text: g.objective.text, done: g.done, total: g.total };
      for (const id of g.taskIds) map.set(id, info);
    }
    return map;
  });

  readonly currentObjective = computed(() => {
    const id = this.todos.currentTaskId();
    return id ? (this.objectiveByTask().get(id) ?? null) : null;
  });

  readonly annotate = (id: string): string | null => this.objectiveByTask().get(id)?.text ?? null;

  readonly upNext = computed(() => {
    const fin = this.justFinished();
    if (!fin || this.todos.currentTask()) return null;
    const done = new Map(this.todos.todos().map((t) => [t.id, t.done] as const));
    const nextId = nextOpenTask(this.dailyPlan.committedPlannedTaskIds(), done, fin.id);
    const objective = fin.objectiveId ? this.groups().find((g) => g.objective?.id === fin.objectiveId) : undefined;
    return {
      next: nextId ? (this.todos.todos().find((t) => t.id === nextId) as Todo) : null,
      objective: objective?.objective
        ? { text: objective.objective.text, done: objective.done, total: objective.total, achieved: objective.done >= objective.total }
        : null,
    };
  });

  constructor() {
    this.clock.ensureNotificationPermission();
    // Any way of picking a task (the picker, a drop, the plan list) ends the up-next state.
    effect(() => {
      if (this.todos.currentTask() && untracked(this.justFinished)) this.justFinished.set(null);
    });
  }

  startNext(todo: Todo): void {
    this.justFinished.set(null);
    this.todos.setCurrentTask(todo.id);
  }

  openPlanning(): void {
    this.view.openPlanning();
  }

  startTitleEdit(): void {
    const currentTask = this.todos.currentTask();
    if (!currentTask) return;
    this.editTitle.set(currentTask.title);
    this.titleEditing.set(true);
    this.selectTitleInput();
  }

  /**
   * Selects the title input once it exists in the DOM *and* ngModel has written the
   * current value into it — ngModel does that in a microtask, and assigning
   * `input.value` collapses any selection, so selecting any earlier is a no-op.
   */
  private selectTitleInput(): void {
    afterNextRender(
      () => queueMicrotask(() => this.titleInput()?.nativeElement.select()),
      { injector: this.injector },
    );
  }

  cancelTitleEdit(): void {
    this.titleEditing.set(false);
  }

  commitTitleEdit(): void {
    const cur = this.todos.currentTask();
    if (cur) {
      const trimmed = this.editTitle().trim();
      if (trimmed && trimmed !== cur.title) {
        this.todos.updateTodo(cur.id, { title: trimmed });
      }
    }
    this.titleEditing.set(false);
  }

  openDetail(): void {
    this.showDetail.set(true);
  }

  openTaskModal(): void {
    this.taskModalOpen.set(true);
  }

  selectTask(id: string): void {
    this.todos.setCurrentTask(id);
    this.taskModalOpen.set(false);
  }

  onDropSelectTask(event: DragEvent): void {
    event.preventDefault();
    const id = this.todos.draggedId();
    if (id) this.todos.setCurrentTask(id);
  }

  finishTask(): void {
    const currentTask = this.todos.currentTask();
    if (!currentTask) return;
    const objectiveId = this.dailyPlan.committedAssignments()[currentTask.id] ?? null;
    this.todos.toggleDone(currentTask.id);
    if (this.groups().length) {
      this.justFinished.set({ id: currentTask.id, title: currentTask.title, objectiveId });
      return;
    }
    this.taskModalOpen.set(true);
  }
}
