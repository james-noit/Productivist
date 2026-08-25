import { Component, ElementRef, OnInit, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { MultitaskService } from '../../../services/multitask.service';
import { ClockService } from '../../../services/clock.service';
import { ProjectsService } from '../../../services/projects.service';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import { TaskPickerComponent } from '../task-picker/task-picker.component';
import type { AccomplishmentMark, MultitaskCard } from '../../../types/multitask';

const FINISH_STRIKE_MS = 450;

@Component({
  selector: 'app-multitask-task-row',
  standalone: true,
  imports: [FormsModule, TranslatePipe, TaskDetailModalComponent, TaskPickerComponent],
  templateUrl: './multitask-task-row.component.html',
  styleUrl: './multitask-task-row.component.css',
})
export class MultitaskTaskRowComponent implements OnInit {
  readonly todos = inject(TodosService);
  readonly multitask = inject(MultitaskService);
  private readonly clock = inject(ClockService);
  private readonly projects = inject(ProjectsService);

  readonly card = input.required<MultitaskCard>();
  readonly borderColor = input.required<string>();

  readonly task = computed(() => this.todos.todos().find((todo) => todo.id === this.card().taskId) ?? null);
  readonly project = computed(() => {
    const task = this.task();
    return task ? this.projects.projects().find((p) => p.id === task.projectId) : undefined;
  });
  readonly milestone = computed(() => {
    const task = this.task();
    return task ? this.projects.milestones().find((m) => m.id === task.milestoneId) : undefined;
  });

  readonly taskModalOpen = signal(false);
  readonly showDetail = signal(false);
  readonly titleEditing = signal(false);
  readonly editTitle = signal('');

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  readonly isPickable = (todoId: string): boolean =>
    !this.multitask.assignedTaskIds().has(todoId) || todoId === this.card().taskId;

  readonly isDissolving = computed(() => this.card().taskId === null && !this.taskModalOpen());

  // The picker is a full-viewport blocking overlay (consistent with every other modal
  // in this app), which is fine for a single card but becomes a real problem in a list
  // of independent rows: if it auto-opens while another row has a pending profitability
  // check, it silently swallows clicks meant for that row's X/tick/double-tick buttons.
  // Give the iteration check priority: don't auto-open into it, and close out of it if
  // one starts while we're already open.
  readonly anyOtherPendingIteration = computed(() => {
    const lastFocusEndAt = this.clock.lastFocusEndAt();
    return (
      lastFocusEndAt !== null &&
      this.multitask
        .cards()
        .some((c) => c.id !== this.card().id && c.taskId !== null && c.lastAnsweredPhaseEndAt !== lastFocusEndAt)
    );
  });

  readonly strikeActive = signal(false);

  readonly showIterationCheck = computed(() => {
    const lastFocusEndAt = this.clock.lastFocusEndAt();
    return this.card().taskId !== null && lastFocusEndAt !== null && this.card().lastAnsweredPhaseEndAt !== lastFocusEndAt;
  });

  constructor() {
    effect(() => {
      this.clock.lastFocusEndAt();
      if (untracked(this.taskModalOpen)) this.closeTaskModal();
    });
  }

  ngOnInit(): void {
    if (this.card().taskId !== null) return;
    if (this.anyOtherPendingIteration()) {
      // Don't force the modal open over a pending check elsewhere, but don't leave this
      // row on its dissolve countdown either — it would vanish before the user gets back
      // to it. It waits, un-opened, until they click "Select task" themselves.
      this.multitask.cancelDissolve(this.card().id);
      return;
    }
    this.openTaskModal();
  }

  openTaskModal(): void {
    this.taskModalOpen.set(true);
    this.multitask.cancelDissolve(this.card().id);
  }

  closeTaskModal(): void {
    this.taskModalOpen.set(false);
    this.multitask.scheduleDissolveIfEmpty(this.card().id);
  }

  selectTask(id: string): void {
    this.multitask.assignTask(this.card().id, id);
    this.taskModalOpen.set(false);
  }

  onFinish(): void {
    if (!this.task() || this.strikeActive()) return;
    this.strikeActive.set(true);
    setTimeout(() => {
      this.multitask.finishCard(this.card().id);
    }, FINISH_STRIKE_MS);
  }

  onClear(): void {
    this.multitask.clearCard(this.card().id);
  }

  answerIteration(marks: AccomplishmentMark[]): void {
    const lastFocusEndAt = this.clock.lastFocusEndAt();
    if (lastFocusEndAt === null) return;
    this.multitask.recordAccomplishment(this.card().id, marks, lastFocusEndAt);
  }

  startTitleEdit(e: Event): void {
    e.stopPropagation();
    const task = this.task();
    if (!task || this.strikeActive()) return;
    this.editTitle.set(task.title);
    this.titleEditing.set(true);
    setTimeout(() => {
      this.titleInput()?.nativeElement.select();
    }, 0);
  }

  cancelTitleEdit(): void {
    this.titleEditing.set(false);
  }

  commitTitleEdit(): void {
    const cur = this.task();
    if (cur) {
      const trimmed = this.editTitle().trim();
      if (trimmed && trimmed !== cur.title) {
        this.todos.updateTodo(cur.id, { title: trimmed });
      }
    }
    this.titleEditing.set(false);
  }

  openDetail(e: Event): void {
    e.stopPropagation();
    if (!this.task() || this.strikeActive() || this.titleEditing()) return;
    this.showDetail.set(true);
  }
}
