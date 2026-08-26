import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  SettingsService,
  MIN_DURATION_SECONDS,
  MAX_FOCUS_SECONDS,
  MAX_BREAK_SECONDS,
} from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { ClockService } from '../../../services/clock.service';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { ViewService } from '../../../services/view.service';
import { ClockSettingsComponent } from '../clock-settings/clock-settings.component';
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
    ClockSettingsComponent,
    BoxClockComponent,
    TaskDetailModalComponent,
    TaskProjectTagComponent,
    TaskPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pomodoro-clock.component.html',
  styleUrl: './pomodoro-clock.component.css',
})
export class PomodoroClockComponent {
  readonly settings = inject(SettingsService);
  readonly todos = inject(TodosService);
  readonly clock = inject(ClockService);
  readonly dailyPlan = inject(DailyPlanService);
  private readonly view = inject(ViewService);

  readonly plannedTasks = computed(() => {
    const ids = new Set(this.dailyPlan.committedPlannedTaskIds());
    return this.todos.todos().filter((t) => !t.done && ids.has(t.id));
  });

  readonly radius = RADIUS;
  readonly circumference = CIRCUMFERENCE;

  readonly progress = computed(() =>
    this.clock.totalSeconds() === 0 ? 0 : 1 - this.clock.remainingSeconds() / this.clock.totalSeconds(),
  );

  readonly dashOffset = computed(() => this.circumference * (1 - this.progress()));

  readonly formattedTime = computed(() => {
    const minutes = Math.floor(this.clock.remainingSeconds() / 60);
    const seconds = this.clock.remainingSeconds() % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  });

  readonly currentDurationSeconds = computed(() =>
    this.clock.mode() === 'focus' ? this.settings.focusSeconds() : this.settings.breakSeconds(),
  );
  readonly maxDurationSeconds = computed(() => (this.clock.mode() === 'focus' ? MAX_FOCUS_SECONDS : MAX_BREAK_SECONDS));
  readonly canDecreaseDuration = computed(() => !this.clock.running() && this.currentDurationSeconds() > MIN_DURATION_SECONDS);
  readonly canIncreaseDuration = computed(
    () => !this.clock.running() && this.currentDurationSeconds() < this.maxDurationSeconds(),
  );

  readonly taskModalOpen = signal(false);
  readonly showDetail = signal(false);
  readonly titleEditing = signal(false);
  readonly editTitle = signal('');

  private readonly injector = inject(Injector);

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  constructor() {
    this.clock.ensureNotificationPermission();
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

  finishTask(): void {
    const currentTask = this.todos.currentTask();
    if (!currentTask) return;
    this.todos.toggleDone(currentTask.id);
    this.taskModalOpen.set(true);
  }

  selectPlannedTask(id: string): void {
    this.todos.setCurrentTask(id);
  }

  goToPlanningLab(): void {
    localStorage.setItem('productivist.planningLabTab', JSON.stringify('daily'));
    this.view.setView('planning-lab');
  }
}
