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
import type { Recurrence, RecurrenceDraftFields, RecurrenceMode, RecurrenceUnit } from '../../../types/recurrence';
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

type StatusFilter = 'all' | 'active' | 'paused';
type UnitFilter = 'any' | RecurrenceUnit;
type ModeFilter = 'any' | RecurrenceMode;
/** The project filter: every series, the ones without a project, or one project's id. */
const ALL = 'all';
const NONE = 'none';

interface FilterOption<T extends string> {
  id: T;
  labelKey: string;
}

const STATUS_OPTIONS: readonly FilterOption<StatusFilter>[] = [
  { id: 'all', labelKey: 'todo.filterAll' },
  { id: 'active', labelKey: 'recurrence.modal.active' },
  { id: 'paused', labelKey: 'recurrence.modal.pausedFilter' },
];
const UNIT_OPTIONS: readonly FilterOption<UnitFilter>[] = [
  { id: 'any', labelKey: 'recurrence.modal.any' },
  { id: 'day', labelKey: 'recurrence.modal.daily' },
  { id: 'week', labelKey: 'recurrence.modal.weekly' },
  { id: 'month', labelKey: 'recurrence.modal.monthly' },
  { id: 'year', labelKey: 'recurrence.modal.yearly' },
];
const MODE_OPTIONS: readonly FilterOption<ModeFilter>[] = [
  { id: 'any', labelKey: 'recurrence.modal.any' },
  { id: 'schedule', labelKey: 'recurrence.modal.scheduled' },
  { id: 'afterCompletion', labelKey: 'recurrence.modal.afterCompletion' },
];

interface FilterChip {
  id: 'project' | 'status' | 'unit' | 'mode';
  /** A project chip shows the project's name; the others a translated label. */
  name: string | null;
  labelKey: string;
}

function draftFrom(rec: Recurrence | null, projectRef = ''): SeriesDraft {
  return {
    title: rec?.title ?? '',
    description: rec?.description ?? '',
    importance: rec?.importance ?? 'medium',
    urgency: rec?.urgency ?? 'medium',
    tags: rec ? [...rec.tags] : [],
    projectRef: rec?.projectId ?? projectRef,
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

  // Filters are local to the modal: opened from a project they start on that project, and nothing is persisted.
  readonly statusOptions = STATUS_OPTIONS;
  readonly unitOptions = UNIT_OPTIONS;
  readonly modeOptions = MODE_OPTIONS;
  readonly filtersOpen = signal(false);
  readonly projectFilter = signal<string>(this.view.recurringProjectFilter() ?? ALL);
  readonly statusFilter = signal<StatusFilter>('all');
  readonly unitFilter = signal<UnitFilter>('any');
  readonly modeFilter = signal<ModeFilter>('any');
  readonly ALL = ALL;
  readonly NONE = NONE;

  /** The projects that have at least one series (plus the one the modal was opened for), in project order. */
  readonly projectOptions = computed(() => {
    const used = new Set(this.recurrences.recurrences().map((rec) => rec.projectId));
    const wanted = this.projectFilter();
    return this.projects.sortedProjects().filter((p) => used.has(p.id) || p.id === wanted);
  });

  readonly chips = computed<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    const project = this.projectFilter();
    if (project === NONE) chips.push({ id: 'project', name: null, labelKey: 'recurrence.modal.noProject' });
    else if (project !== ALL) {
      const name = this.projects.projects().find((p) => p.id === project)?.name;
      if (name) chips.push({ id: 'project', name, labelKey: '' });
    }
    const status = STATUS_OPTIONS.find((o) => o.id === this.statusFilter());
    if (status && status.id !== 'all') chips.push({ id: 'status', name: null, labelKey: status.labelKey });
    const unit = UNIT_OPTIONS.find((o) => o.id === this.unitFilter());
    if (unit && unit.id !== 'any') chips.push({ id: 'unit', name: null, labelKey: unit.labelKey });
    const mode = MODE_OPTIONS.find((o) => o.id === this.modeFilter());
    if (mode && mode.id !== 'any') chips.push({ id: 'mode', name: null, labelKey: mode.labelKey });
    return chips;
  });
  readonly activeFilters = computed(() => this.chips().length);

  private readonly dayFormat = computed(() => new Intl.DateTimeFormat(this.settings.language(), { weekday: 'short', day: 'numeric', month: 'short' }));

  readonly rows = computed(() => {
    const query = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const project = this.projectFilter();
    const unit = this.unitFilter();
    const mode = this.modeFilter();
    const projects = new Map(this.projects.projects().map((p) => [p.id, p.name]));
    const open = this.recurrences.occurrencesBySeries();
    return this.recurrences
      .sorted()
      .filter((rec) => (status === 'all' ? true : status === 'paused' ? !!rec.paused : !rec.paused))
      .filter((rec) => (project === ALL ? true : project === NONE ? !rec.projectId : rec.projectId === project))
      .filter((rec) => unit === 'any' || rec.unit === unit)
      .filter((rec) => mode === 'any' || rec.mode === mode)
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
    computation: () => untracked(() => this.draftFor(this.selected())),
  });
  readonly draft = linkedSignal<string | null, SeriesDraft>({
    source: this.selection,
    computation: () => untracked(() => this.draftFor(this.selected())),
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

  /** A new series starts in the project the list is filtered to, so "New" from a project needs no extra step. */
  private draftFor(rec: Recurrence | null): SeriesDraft {
    const project = this.projectFilter();
    return draftFrom(rec, !rec && project !== ALL && project !== NONE ? project : '');
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

  removeChip(chip: FilterChip): void {
    if (chip.id === 'project') this.projectFilter.set(ALL);
    else if (chip.id === 'status') this.statusFilter.set('all');
    else if (chip.id === 'unit') this.unitFilter.set('any');
    else this.modeFilter.set('any');
  }

  clearFilters(): void {
    this.projectFilter.set(ALL);
    this.statusFilter.set('all');
    this.unitFilter.set('any');
    this.modeFilter.set('any');
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
