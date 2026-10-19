import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { isIsoDate, orderedDates, parseIso, todayIso } from '../../../lib/dates';
import { trapTab } from '../../../lib/focus-trap';
import { AutoGrowDirective } from '../../directives/auto-grow.directive';
import { SettingsService } from '../../../services/settings.service';
import { TodosService, type TodoPatch } from '../../../services/todos.service';
import { ProjectsService } from '../../../services/projects.service';
import { RecurrenceService } from '../../../services/recurrence.service';
import { RecurrenceFormatService } from '../../../services/recurrence-format.service';
import { ViewService } from '../../../services/view.service';
import {
  ProjectMilestonePickerComponent,
  NEW_REF,
} from '../project-milestone-picker/project-milestone-picker.component';
import { forgeName, forgeRef } from '../../../lib/forge-flavors';
import { loadForgeTexts } from '../../../lib/forge-texts';
import { ExternalHrefDirective } from '../../directives/external-href.directive';
import { NumberStepperComponent } from '../number-stepper/number-stepper.component';
import { TagInputComponent } from '../tag-input/tag-input.component';
import {
  RecurrenceEditorComponent,
  ruleDraftFrom,
  ruleFields,
  rulesEqual,
  ruleValid,
  type RuleDraft,
} from '../recurrence-editor/recurrence-editor.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { Priority, TaskStatus, Todo } from '../../../types/todo';

/**
 * Everything the modal edits, held locally until Save. Dates are '' or 'YYYY-MM-DD'; `projectRef` and
 * `milestoneRef` use the picker's refs ('' = none, NEW_REF = a project/milestone typed into the picker
 * and created on Save). A new persisted field is added here, in `draftFrom` and in `draftsEqual`, then
 * committed in `save()`.
 */
export interface TaskDraft {
  title: string;
  description: string;
  done: boolean;
  /** The workflow column while open; kept (and hidden) while `done`. */
  status: TaskStatus;
  importance: Priority;
  urgency: Priority;
  tags: string[];
  projectRef: string;
  milestoneRef: string;
  startDate: string;
  dueDate: string;
  /** null = no estimate. */
  pomodoros: number | null;
  /**
   * A repeat rule being set up for a task that does not repeat yet: on Save a series is created from the task
   * and the task becomes its current occurrence. Always null in the baseline. A task that already belongs to
   * a series is edited through the recurring-tasks modal instead, so this stays null for it.
   */
  repeat: RuleDraft | null;
}

export function draftFrom(todo: Todo): TaskDraft {
  return {
    title: todo.title,
    description: todo.description ?? '',
    done: todo.done,
    status: todo.status ?? 'todo',
    importance: todo.importance,
    urgency: todo.urgency,
    tags: [...todo.tags],
    projectRef: todo.projectId ?? '',
    milestoneRef: todo.projectId ? (todo.milestoneId ?? '') : '',
    startDate: todo.startDate ?? '',
    dueDate: todo.dueDate ?? '',
    pomodoros: todo.pomodorosForTermination ?? null,
    repeat: null,
  };
}

export function draftsEqual(a: TaskDraft, b: TaskDraft): boolean {
  return (
    a.title.trim() === b.title.trim() &&
    a.description.trim() === b.description.trim() &&
    a.done === b.done &&
    a.status === b.status &&
    a.importance === b.importance &&
    a.urgency === b.urgency &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, i) => tag === b.tags[i]) &&
    a.projectRef === b.projectRef &&
    a.milestoneRef === b.milestoneRef &&
    a.startDate === b.startDate &&
    a.dueDate === b.dueDate &&
    a.pomodoros === b.pomodoros &&
    (a.repeat === b.repeat || (!!a.repeat && !!b.repeat && rulesEqual(a.repeat, b.repeat)))
  );
}

type Confirm = 'discard' | 'delete' | 'stop' | null;

let nextUid = 0;

@Component({
  selector: 'app-task-detail-modal',
  standalone: true,
  imports: [
    TranslatePipe,
    ProjectMilestonePickerComponent,
    TagInputComponent,
    NumberStepperComponent,
    UiIconComponent,
    RecurrenceEditorComponent,
    AutoGrowDirective,
    ExternalHrefDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-detail-modal.component.html',
  styleUrl: './task-detail-modal.component.css',
})
export class TaskDetailModalComponent {
  protected readonly forgeName = forgeName;
  protected readonly forgeRef = forgeRef;
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly settings = inject(SettingsService);
  private readonly recurrences = inject(RecurrenceService);
  private readonly format = inject(RecurrenceFormatService);
  private readonly view = inject(ViewService);
  private readonly injector = inject(Injector);

  readonly todo = input.required<Todo>();
  readonly close = output<void>();

  readonly uid = `task-detail-${nextUid++}`;
  readonly priorities: readonly Priority[] = ['low', 'medium', 'high'];
  readonly statuses: readonly TaskStatus[] = ['todo', 'inProgress', 'review'];

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly picker = viewChild(ProjectMilestonePickerComponent);
  private readonly tagInput = viewChild(TagInputComponent);
  private readonly confirmFocus = viewChild<ElementRef<HTMLElement>>('confirmFocus');
  private readonly deleteButton = viewChild<ElementRef<HTMLElement>>('deleteButton');
  private readonly stopButton = viewChild<ElementRef<HTMLElement>>('stopButton');

  /** The task as it was when the modal opened: dirty and Save's diff are measured against it. */
  readonly baseline = linkedSignal<string, TaskDraft>({
    source: () => this.todo().id,
    computation: () => draftFrom(untracked(this.todo)),
  });
  readonly draft = linkedSignal<string, TaskDraft>({
    source: () => this.todo().id,
    computation: () => draftFrom(untracked(this.todo)),
  });

  readonly confirm = signal<Confirm>(null);

  readonly dirty = computed(() => !draftsEqual(this.draft(), this.baseline()));
  readonly titleValid = computed(() => this.draft().title.trim().length > 0);

  /** A project or milestone typed into the picker's inline form needs a name before it can be created. */
  private readonly newRefsValid = computed(() => {
    const draft = this.draft();
    const picker = this.picker();
    if (draft.projectRef === NEW_REF) return !!picker && picker.projectName().trim().length > 0;
    if (draft.milestoneRef === NEW_REF && draft.projectRef) return !!picker && picker.milestoneName().trim().length > 0;
    return true;
  });
  private readonly repeatValid = computed(() => {
    const rule = this.draft().repeat;
    return !rule || ruleValid(rule);
  });
  readonly canSave = computed(() => this.dirty() && this.titleValid() && this.newRefsValid() && this.repeatValid());

  /** The occurrence the new series would already have (this task, on its due date or today): the preview continues after it. */
  readonly repeatAfter = computed(() => this.draft().dueDate || todayIso());

  /** The series this task is an occurrence of; a dangling `recurrenceId` (series deleted) counts as none. */
  readonly series = computed(() => {
    const id = this.todo().recurrenceId;
    return id ? (this.recurrences.byId().get(id) ?? null) : null;
  });

  /** The rule line and the next-date line of the Repeat field, for a task that belongs to a series. */
  readonly seriesInfo = computed(() => {
    const series = this.series();
    if (!series) return null;
    const next = this.format.nextDateOf(series);
    const open = !this.todo().done;
    const format = this.dayFormat();
    return {
      rule: this.format.describe(series),
      paused: !!series.paused,
      nextKey: next
        ? open
          ? 'recurrence.nextAfterThis'
          : 'recurrence.nextDate'
        : open && series.mode === 'afterCompletion'
          ? 'recurrence.nextOnCompletion'
          : 'recurrence.ended',
      nextDate: next ? format.format(parseIsoSafe(next)) : '',
    };
  });

  private readonly dayFormat = computed(
    () => new Intl.DateTimeFormat(this.settings.language(), { day: 'numeric', month: 'short' }),
  );

  /** The muted line under the title: project › milestone, then the status or the completion day. */
  readonly meta = computed(() => {
    const draft = this.draft();
    const projectId = draft.projectRef && draft.projectRef !== NEW_REF ? draft.projectRef : undefined;
    const project = projectId ? this.projects.projects().find((p) => p.id === projectId)?.name : undefined;
    const milestone =
      projectId && draft.milestoneRef && draft.milestoneRef !== NEW_REF
        ? this.projects.milestones().find((m) => m.id === draft.milestoneRef)?.name
        : undefined;
    // Saved completion time when it was already done; "today" when this Save will complete it.
    const completedAt = this.baseline().done ? this.todo().completedAt : undefined;
    const doneDay = draft.done ? this.dayFormat().format(completedAt ? new Date(completedAt) : new Date()) : null;
    const series = this.series();
    const rule = draft.repeat && ruleValid(draft.repeat) ? ruleFields(draft.repeat) : null;
    const repeat = series ? this.format.describe(series) : rule ? this.format.describe(rule) : null;
    return { project, milestone, doneDay, repeat, statusKey: `kanban.columns.${draft.status}` };
  });

  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private pressedOnBackdrop = false;
  private focusBeforeConfirm: HTMLElement | null = null;

  /** Set once the Git forge strings are in (`lib/forge-texts.ts`, a lazy chunk); only an imported task needs them. */
  readonly forgeReady = signal(false);
  private readonly translateService = inject(TranslateService);

  constructor() {
    effect(() => {
      if (this.todo().source && !untracked(this.forgeReady)) {
        void loadForgeTexts(this.translateService).then(() => this.forgeReady.set(true));
      }
    });
    afterNextRender(() => this.panel().nativeElement.focus({ preventScroll: true }));
    inject(DestroyRef).onDestroy(() => {
      if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    });
  }

  // ---- draft edits ----

  edit(patch: Partial<TaskDraft>): void {
    this.draft.update((d) => ({ ...d, ...patch }));
  }

  /** A start after the due date swaps the two, as soon as both are set. */
  editDates(which: 'startDate' | 'dueDate', value: string): void {
    const next = { ...this.draft(), [which]: isIsoDate(value) ? value : '' };
    const dates = orderedDates(next.startDate || undefined, next.dueDate || undefined);
    this.draft.set({ ...next, startDate: dates.startDate ?? '', dueDate: dates.dueDate ?? '' });
  }

  /** Picking a workflow status on a finished task reopens it (what dropping it on that column does). */
  pickStatus(status: TaskStatus): void {
    this.edit({ status, done: false });
  }

  /** "Repeat…": opens the rule form, prefilled with the due date (or today) as the first date. */
  startRepeat(): void {
    const draft = this.draft();
    this.edit({ repeat: ruleDraftFrom(null, draft.dueDate || draft.startDate || todayIso()) });
  }

  editSeries(): void {
    const series = this.series();
    if (series) this.view.openRecurring(series.id);
  }

  /** Deletes the series; this task stays, as a plain task. */
  stopRepeating(): void {
    const series = this.series();
    this.confirm.set(null);
    if (series) this.recurrences.remove(series.id);
    afterNextRender(() => this.panel().nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  askStop(): void {
    this.openConfirm('stop');
  }

  onProjectPicked(): void {
    this.edit({ milestoneRef: '' });
  }

  // ---- closing ----

  /** The one way out: a clean draft closes, a dirty one asks first, an open question is dismissed. */
  requestClose(): void {
    if (this.confirm()) {
      this.dismissConfirm();
    } else if (this.dirty()) {
      this.openConfirm('discard');
    } else {
      this.close.emit();
    }
  }

  discard(): void {
    this.close.emit();
  }

  askDelete(): void {
    this.openConfirm('delete');
  }

  dismissConfirm(): void {
    const kind = this.confirm();
    this.confirm.set(null);
    afterNextRender(
      () => {
        const target =
          kind === 'delete'
            ? this.deleteButton()?.nativeElement
            : kind === 'stop'
              ? this.stopButton()?.nativeElement
              : this.focusBeforeConfirm?.isConnected
              ? this.focusBeforeConfirm
              : this.panel().nativeElement;
        target?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  private openConfirm(kind: Exclude<Confirm, null>): void {
    this.focusBeforeConfirm = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.confirm.set(kind);
    afterNextRender(() => this.confirmFocus()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  remove(): void {
    this.todos.removeTodo(this.todo().id);
    this.close.emit();
  }

  onBackdropDown(event: MouseEvent): void {
    this.pressedOnBackdrop = event.target === event.currentTarget;
  }

  /** Only a press *and* release on the backdrop counts, so dragging a text selection out of a field does not. */
  onBackdropClick(event: MouseEvent): void {
    if (this.pressedOnBackdrop && event.target === event.currentTarget) this.requestClose();
    this.pressedOnBackdrop = false;
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Swallowed: the project view would otherwise treat it as "leave the project".
      event.preventDefault();
      event.stopPropagation();
      this.requestClose();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      if (!this.confirm()) this.save();
    } else {
      trapTab(event, this.panel().nativeElement);
    }
  }

  // ---- saving ----

  /** Writes every change at once: one patch for plain fields, then status and completion, then closes. */
  save(): void {
    this.tagInput()?.commitPending();
    if (!this.canSave()) return;
    const draft = this.draft();
    const base = this.baseline();
    const live = this.todo();
    const id = live.id;
    const patch: TodoPatch = {};

    if (draft.title.trim() !== base.title.trim()) patch.title = draft.title.trim();
    if (draft.description.trim() !== base.description.trim()) patch.description = draft.description.trim() || undefined;
    if (draft.importance !== base.importance) patch.importance = draft.importance;
    if (draft.urgency !== base.urgency) patch.urgency = draft.urgency;
    if (draft.tags.length !== base.tags.length || draft.tags.some((tag, i) => tag !== base.tags[i])) patch.tags = draft.tags;
    if (draft.pomodoros !== base.pomodoros) patch.pomodorosForTermination = draft.pomodoros ?? undefined;
    if (draft.startDate !== base.startDate || draft.dueDate !== base.dueDate) {
      const dates = orderedDates(draft.startDate || undefined, draft.dueDate || undefined);
      patch.startDate = dates.startDate;
      patch.dueDate = dates.dueDate;
    }

    if (draft.projectRef !== base.projectRef || draft.milestoneRef !== base.milestoneRef) {
      const picker = this.picker();
      let projectId: string | undefined;
      let milestoneId: string | undefined;
      if (draft.projectRef === NEW_REF) {
        projectId = this.projects.addProject({
          icon: picker?.chosenIcon() ?? '',
          name: picker?.projectName().trim() ?? '',
          description: '',
          notes: '',
        }).id;
      } else {
        projectId = draft.projectRef || undefined;
        if (projectId && draft.milestoneRef === NEW_REF) {
          milestoneId = this.projects.addMilestone(projectId, picker?.milestoneName().trim() ?? '').id;
        } else if (projectId) {
          milestoneId = draft.milestoneRef || undefined;
        }
      }
      patch.projectId = projectId;
      patch.milestoneId = milestoneId;
    }

    // "Repeat…": the series is made from the task as it will be after this Save, and the task becomes its
    // current occurrence (linked in the same tick, so the series does not create another one for this period).
    if (draft.repeat && ruleValid(draft.repeat)) {
      const projectId = 'projectId' in patch ? patch.projectId : live.projectId;
      const milestoneId = 'milestoneId' in patch ? patch.milestoneId : live.milestoneId;
      const description = 'description' in patch ? patch.description : live.description;
      const pomodoros = 'pomodorosForTermination' in patch ? patch.pomodorosForTermination : live.pomodorosForTermination;
      const dates = orderedDates(draft.startDate || undefined, draft.dueDate || undefined);
      const series = this.recurrences.create(
        {
          title: draft.title.trim(),
          importance: draft.importance,
          urgency: draft.urgency,
          tags: [...draft.tags],
          ...(description ? { description } : {}),
          ...(projectId ? { projectId } : {}),
          ...(projectId && milestoneId ? { milestoneId } : {}),
          ...(pomodoros ? { pomodorosForTermination: pomodoros } : {}),
          ...ruleFields(draft.repeat),
        },
        dates.dueDate ?? todayIso(),
      );
      patch.recurrenceId = series.id;
    }

    const statusChanged = draft.status !== base.status;
    if (draft.done && statusChanged) patch.status = draft.status === 'todo' ? undefined : draft.status;

    if (Object.keys(patch).length) this.todos.updateTodo(id, patch);

    if (draft.done) {
      if (draft.done !== base.done && !live.done) this.todos.toggleDone(id);
    } else if (statusChanged) {
      // Also reopens the task, which is what choosing a status on a finished one means.
      this.todos.moveOnBoard(id, { column: draft.status });
    } else if (draft.done !== base.done && live.done) {
      this.todos.toggleDone(id);
    }

    this.close.emit();
  }
}

/** `parseIso` for a day the lib just produced; falls back to today so formatting never throws. */
function parseIsoSafe(iso: string): Date {
  return parseIso(iso) ?? new Date();
}
