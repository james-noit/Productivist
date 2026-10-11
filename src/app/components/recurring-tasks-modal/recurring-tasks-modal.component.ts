import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatIso, todayIso } from '../../../lib/dates';
import { trapTab } from '../../../lib/focus-trap';
import { RecurrenceService } from '../../../services/recurrence.service';
import { RecurrenceFormatService } from '../../../services/recurrence-format.service';
import { ProjectsService } from '../../../services/projects.service';
import { SettingsService } from '../../../services/settings.service';
import { ViewService } from '../../../services/view.service';
import { AutoGrowDirective } from '../../directives/auto-grow.directive';
import { NumberStepperComponent } from '../number-stepper/number-stepper.component';
import { ProjectMilestonePickerComponent } from '../project-milestone-picker/project-milestone-picker.component';
import {
  RecurrenceEditorComponent,
  ruleDraftFrom,
  ruleFields,
  rulesEqual,
  ruleValid,
  type RuleDraft,
} from '../recurrence-editor/recurrence-editor.component';
import { TagInputComponent } from '../tag-input/tag-input.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { Recurrence, RecurrenceDraftFields } from '../../../types/recurrence';
import type { Priority } from '../../../types/todo';

/** What the series editor edits, held locally until Save. `projectRef`/`milestoneRef` are ids ('' = none). */
interface SeriesDraft {
  title: string;
  description: string;
  importance: Priority;
  urgency: Priority;
  tags: string[];
  projectRef: string;
  milestoneRef: string;
  pomodoros: number | null;
  rule: RuleDraft;
}

const NEW = 'new';

function draftFrom(rec: Recurrence | null): SeriesDraft {
  return {
    title: rec?.title ?? '',
    description: rec?.description ?? '',
    importance: rec?.importance ?? 'medium',
    urgency: rec?.urgency ?? 'medium',
    tags: rec ? [...rec.tags] : [],
    projectRef: rec?.projectId ?? '',
    milestoneRef: rec?.projectId ? (rec.milestoneId ?? '') : '',
    pomodoros: rec?.pomodorosForTermination ?? null,
    rule: ruleDraftFrom(rec, todayIso()),
  };
}

function draftsEqual(a: SeriesDraft, b: SeriesDraft): boolean {
  return (
    a.title.trim() === b.title.trim() &&
    a.description.trim() === b.description.trim() &&
    a.importance === b.importance &&
    a.urgency === b.urgency &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, i) => tag === b.tags[i]) &&
    a.projectRef === b.projectRef &&
    a.milestoneRef === b.milestoneRef &&
    a.pomodoros === b.pomodoros &&
    rulesEqual(a.rule, b.rule)
  );
}

type Confirm = 'discard' | 'delete' | null;
/** Where to go once an "unsaved changes" question is answered: a series id, NEW, null (the list) or the end. */
type Leave = string | null | 'close';

let nextUid = 0;

/**
 * Manage recurring tasks: master/detail (list left, editor right) from 900px, list → editor below that. Rendered
 * by AppComponent from `ViewService.recurringOpen`, so the Tasks and projects header, the menu and Task Details'
 * "Edit series" open it over any view; `ViewService.recurringSeriesId` is the series it opens on.
 * The editor is a draft with Save and a confirm bar for discard / delete, like Task Details.
 */
@Component({
  selector: 'app-recurring-tasks-modal',
  standalone: true,
  imports: [
    TranslatePipe,
    UiIconComponent,
    TagInputComponent,
    NumberStepperComponent,
    ProjectMilestonePickerComponent,
    RecurrenceEditorComponent,
    AutoGrowDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recurring-tasks-modal.component.html',
  styleUrl: './recurring-tasks-modal.component.css',
})
export class RecurringTasksModalComponent {
  private readonly view = inject(ViewService);
  private readonly settings = inject(SettingsService);
  private readonly projects = inject(ProjectsService);
  readonly recurrences = inject(RecurrenceService);
  private readonly format = inject(RecurrenceFormatService);
  private readonly injector = inject(Injector);

  readonly uid = `recurring-${nextUid++}`;
  readonly priorities: readonly Priority[] = ['low', 'medium', 'high'];
  readonly NEW = NEW;

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly confirmFocus = viewChild<ElementRef<HTMLElement>>('confirmFocus');
  private readonly deleteButton = viewChild<ElementRef<HTMLElement>>('deleteButton');
  private readonly tagInput = viewChild(TagInputComponent);

  // ---- list ----

  readonly search = signal('');
  readonly filter = signal<'all' | 'active' | 'paused'>('all');

  private readonly dayFormat = computed(() => new Intl.DateTimeFormat(this.settings.language(), { weekday: 'short', day: 'numeric', month: 'short' }));

  readonly rows = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filter = this.filter();
    const projects = new Map(this.projects.projects().map((p) => [p.id, p.name]));
    const open = this.recurrences.occurrencesBySeries();
    return this.recurrences
      .sorted()
      .filter((rec) => (filter === 'all' ? true : filter === 'paused' ? !!rec.paused : !rec.paused))
      .filter((rec) => !query || rec.title.toLowerCase().includes(query))
      .map((rec) => {
        const next = this.format.nextDateOf(rec);
        const waiting = !next && rec.mode === 'afterCompletion' && (open.get(rec.id) ?? []).some((t) => !t.done);
        return {
          rec,
          rule: this.format.describe(rec),
          project: rec.projectId ? (projects.get(rec.projectId) ?? null) : null,
          nextKey: rec.paused ? 'recurrence.row.paused' : next ? 'recurrence.row.next' : waiting ? 'recurrence.row.afterCompletion' : 'recurrence.row.ended',
          nextDate: next ? formatIso(this.dayFormat(), next) : '',
        };
      });
  });

  // ---- selection and draft ----

  readonly selection = signal<string | null>(this.initialSelection());
  readonly selected = computed(() => {
    const id = this.selection();
    return id && id !== NEW ? (this.recurrences.byId().get(id) ?? null) : null;
  });
  readonly editing = computed(() => this.selection() !== null);
  readonly isNew = computed(() => this.selection() === NEW);

  readonly baseline = linkedSignal<string | null, SeriesDraft>({
    source: this.selection,
    computation: () => draftFrom(untracked(this.selected)),
  });
  readonly draft = linkedSignal<string | null, SeriesDraft>({
    source: this.selection,
    computation: () => draftFrom(untracked(this.selected)),
  });

  readonly dirty = computed(() => !draftsEqual(this.draft(), this.baseline()));
  readonly titleValid = computed(() => this.draft().title.trim().length > 0);
  readonly canSave = computed(() => this.editing() && this.titleValid() && ruleValid(this.draft().rule) && (this.isNew() || this.dirty()));

  /** The series' open occurrence, if any: what "also update" and "also delete" would touch. */
  readonly openOccurrence = computed(() => {
    const rec = this.selected();
    return rec ? ((this.recurrences.occurrencesBySeries().get(rec.id) ?? []).find((t) => !t.done) ?? null) : null;
  });
  readonly alsoUpdateOpen = signal(true);
  readonly alsoDeleteOpen = signal(false);

  readonly confirm = signal<Confirm>(null);
  private pending: Leave = null;

  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private pressedOnBackdrop = false;
  private focusBeforeConfirm: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => this.panel().nativeElement.focus({ preventScroll: true }));
    inject(DestroyRef).onDestroy(() => {
      if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    });
  }

  private initialSelection(): string | null {
    const id = this.view.recurringSeriesId();
    return id === NEW || (id && this.recurrences.byId().has(id)) ? id : null;
  }

  edit(patch: Partial<SeriesDraft>): void {
    this.draft.update((d) => ({ ...d, ...patch }));
  }

  // ---- navigation (every way out of a dirty draft asks first) ----

  /** Selects a series, starts a new one (NEW), shows the list (null) or closes the modal ('close'). */
  leave(target: Leave): void {
    if (target !== 'close' && target === this.selection()) return;
    if (this.dirty()) {
      this.pending = target;
      this.openConfirm('discard');
      return;
    }
    this.go(target);
  }

  private go(target: Leave): void {
    if (target === 'close') {
      this.view.closeRecurring();
      return;
    }
    this.alsoUpdateOpen.set(true);
    this.alsoDeleteOpen.set(false);
    this.selection.set(target);
  }

  /** The one way out of the modal: an open question is dismissed, a dirty draft asks, a clean one closes. */
  requestClose(): void {
    if (this.confirm()) this.dismissConfirm();
    else this.leave('close');
  }

  discard(): void {
    this.confirm.set(null);
    const target = this.pending;
    this.pending = null;
    this.go(target);
  }

  dismissConfirm(): void {
    const kind = this.confirm();
    this.confirm.set(null);
    this.pending = null;
    afterNextRender(
      () => {
        const target =
          kind === 'delete'
            ? this.deleteButton()?.nativeElement
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

  // ---- actions ----

  save(): void {
    this.tagInput()?.commitPending();
    if (!this.canSave()) return;
    const draft = this.draft();
    const fields: RecurrenceDraftFields = {
      title: draft.title.trim(),
      importance: draft.importance,
      urgency: draft.urgency,
      tags: [...draft.tags],
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
      ...(draft.projectRef ? { projectId: draft.projectRef } : {}),
      ...(draft.projectRef && draft.milestoneRef ? { milestoneId: draft.milestoneRef } : {}),
      ...(draft.pomodoros ? { pomodorosForTermination: draft.pomodoros } : {}),
      ...ruleFields(draft.rule),
    };
    const selected = this.selected();
    if (selected) {
      this.recurrences.update(selected.id, fields, this.alsoUpdateOpen() && !!this.openOccurrence());
      this.baseline.set(draft);
    } else {
      // The selection changes to the new series, which rebuilds the draft from it.
      this.selection.set(this.recurrences.create(fields).id);
    }
  }

  askDelete(): void {
    this.alsoDeleteOpen.set(false);
    this.openConfirm('delete');
  }

  remove(): void {
    const rec = this.selected();
    this.confirm.set(null);
    if (!rec) return;
    this.recurrences.remove(rec.id, this.alsoDeleteOpen() && !!this.openOccurrence());
    this.alsoDeleteOpen.set(false);
    this.selection.set(null);
    afterNextRender(() => this.panel().nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  togglePause(): void {
    const rec = this.selected();
    if (!rec) return;
    if (rec.paused) this.recurrences.resume(rec.id);
    else this.recurrences.pause(rec.id);
  }

  setFilter(value: 'active' | 'paused'): void {
    this.filter.update((current) => (current === value ? 'all' : value));
  }

  // ---- dialog plumbing ----

  onBackdropDown(event: MouseEvent): void {
    this.pressedOnBackdrop = event.target === event.currentTarget;
  }

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
}
