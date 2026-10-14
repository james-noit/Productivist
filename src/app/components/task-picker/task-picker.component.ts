import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { addDays, formatIso, todayIso } from '../../../lib/dates';
import { classify } from '../../../lib/eisenhower';
import { trapTab } from '../../../lib/focus-trap';
import { lockScroll } from '../../../lib/scroll-lock';
import { normalizeQuery } from '../../../lib/search';
import { DailyPlanService, UNASSIGNED_GROUP_ID } from '../../../services/daily-plan.service';
import { ProjectsService } from '../../../services/projects.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { RepeatMarkComponent } from '../repeat-mark/repeat-mark.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { Todo } from '../../../types/todo';

type QuickFilter = 'all' | 'planned' | 'dueWeek' | 'high';

/** Sections longer than this show a "Show N more" row, unless the search has text. */
const SECTION_LIMIT = 8;
const WEEK_DAYS = 7;

interface MetaPart {
  text: string;
  overdue: boolean;
}

interface PickItem {
  kind: 'task' | 'more' | 'create';
  /** Position in the keyboard order (create and more rows included); the option's id is derived from it. */
  index: number;
  todo?: Todo;
  meta?: MetaPart[];
  current?: boolean;
  /** `multiple` mode: the task is ticked. */
  checked?: boolean;
  /** The caller's note for this task (`annotate`), shown muted at the right. */
  note?: string;
  /** `more`: the section it expands and how many rows it holds back. */
  sectionId?: string;
  hidden?: number;
  /** `create`: the title typed in the search, and the project it goes to when the caller named one (else the Inbox). */
  title?: string;
  project?: string;
}

interface PickSection {
  id: string;
  /** Planned today and Inbox are translated; a project shows its name. */
  labelKey: string | null;
  name: string;
  items: PickItem[];
}

interface PickView {
  sections: PickSection[];
  /** Every row in keyboard order. */
  items: PickItem[];
  /** The "Create ..." row, when the search has text. */
  create: PickItem | null;
  taskCount: number;
}

/**
 * The one "choose a task" dialog of the app (Pomodoro's current task, a Multitask card). A quiet, keyboard-first
 * list: a search that owns focus (combobox) over a listbox grouped as Planned today, Inbox and one section per
 * project, a few single-select quick filters, and "Create ... in Inbox" while the search has text. Any new
 * "choose a task" flow reuses it; `isPickable` hides the tasks a caller cannot take. Optional, all backwards
 * compatible: `multiple` (tick several, "Add N tasks" in a footer, `pickMany` once with the ids), `scopeProjectIds`
 * (those projects' sections first, everything else folded into a collapsed "Other projects"), `annotate` (a muted
 * note per row) and `createProjectId` (where "Create ..." puts the new task).
 */
@Component({
  selector: 'app-task-picker',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent, RepeatMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-picker.component.html',
  styleUrl: './task-picker.component.css',
})
export class TaskPickerComponent {
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly settings = inject(SettingsService);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');

  readonly isPickable = input<(todoId: string) => boolean>(() => true);
  /** Tick several tasks and confirm them together; the single-pick rows and footer-less layout are the default. */
  readonly multiple = input(false);
  /** Project ids whose sections come first (`UNASSIGNED_GROUP_ID` = the Inbox); the others fold into "Other projects". */
  readonly scopeProjectIds = input<readonly string[] | null>(null);
  /** A short note shown at the right of a task's row, or null. */
  readonly annotate = input<(todoId: string) => string | null>(() => null);
  /** The project "Create ..." adds the new task to; absent or unknown means the Inbox. */
  readonly createProjectId = input<string | null | undefined>(undefined);

  // Not `select`: that is also a native DOM event, which the search input fires (and bubbles) when text in it is selected.
  readonly pick = output<string>();
  /** `multiple` only: the ticked ids, once, on "Add N tasks" (`pick` also fires once per id). */
  readonly pickMany = output<string[]>();
  readonly close = output<void>();

  /** `multiple` only: what is ticked, in the order it was ticked. */
  readonly selected = signal<readonly string[]>([]);

  readonly query = signal('');
  readonly filter = signal<QuickFilter>('all');
  /** The index (in keyboard order) of the highlighted row. */
  readonly active = signal(0);
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  private readonly today = todayIso();
  private readonly dateFormat = computed(
    () => new Intl.DateTimeFormat(this.settings.language(), { day: 'numeric', month: 'short' }),
  );

  private readonly plannedIds = computed(() => new Set(this.dailyPlan.committedPlannedTaskIds()));

  /** Open tasks the caller can take, before any filter. */
  private readonly pickable = computed(() => {
    const ok = this.isPickable();
    return this.todos.todos().filter((todo) => !todo.done && ok(todo.id));
  });

  /** The "Planned today" chip and section exist only while today's plan still has a task to pick. */
  readonly hasPlanned = computed(() => {
    const planned = this.plannedIds();
    return planned.size > 0 && this.pickable().some((todo) => planned.has(todo.id));
  });

  readonly chips = computed<{ id: QuickFilter; labelKey: string }[]>(() => {
    const chips: { id: QuickFilter; labelKey: string }[] = [{ id: 'all', labelKey: 'picker.all' }];
    if (this.hasPlanned()) chips.push({ id: 'planned', labelKey: 'picker.planned' });
    chips.push({ id: 'dueWeek', labelKey: 'picker.dueWeek' }, { id: 'high', labelKey: 'picker.high' });
    return chips;
  });

  /** The project a created task goes to: the caller's, when it names one that exists. */
  private readonly createTarget = computed(() => {
    const id = this.createProjectId();
    return id ? this.projects.projects().find((p) => p.id === id) : undefined;
  });

  readonly view = computed<PickView>(() => {
    const raw = this.query().trim();
    const query = normalizeQuery(raw);
    const filter = this.hasPlanned() || this.filter() !== 'planned' ? this.filter() : 'all';
    const planned = this.plannedIds();
    const weekEnd = addDays(this.today, WEEK_DAYS - 1);
    const projectsById = new Map(this.projects.projects().map((p) => [p.id, p]));
    const milestoneNames = new Map(this.projects.milestones().map((m) => [m.id, m.name]));
    const currentId = this.todos.currentTaskId();
    const format = this.dateFormat();
    const scope = this.scopeProjectIds();
    const scoped = scope ? new Set(scope.map((id) => (id === UNASSIGNED_GROUP_ID ? 'inbox' : id))) : null;
    const ticked = new Set(this.selected());
    const multiple = this.multiple();
    const annotate = this.annotate();

    const matches = this.pickable().filter((todo) => {
      if (filter === 'planned' && !planned.has(todo.id)) return false;
      if (filter === 'dueWeek' && !(todo.dueDate && todo.dueDate <= weekEnd)) return false;
      if (filter === 'high' && classify(todo) !== 'doFirst') return false;
      if (!query) return true;
      const projectName = todo.projectId ? (projectsById.get(todo.projectId)?.name ?? '') : '';
      return (
        normalizeQuery(todo.title).includes(query) ||
        todo.tags.some((tag) => normalizeQuery(tag).includes(query)) ||
        normalizeQuery(projectName).includes(query)
      );
    });

    // Which section a task goes to: the plan first (unless the chip already is the plan, or a scope is set, which
    // sorts by project instead), then its project; outside the scope everything is one "Other projects" section.
    const showPlanned = this.hasPlanned() && filter !== 'planned' && !scoped;
    const groups = new Map<string, Todo[]>();
    for (const todo of matches) {
      const key =
        showPlanned && planned.has(todo.id)
          ? 'planned'
          : todo.projectId && projectsById.has(todo.projectId)
            ? todo.projectId
            : 'inbox';
      const list = groups.get(key);
      if (list) list.push(todo);
      else groups.set(key, [todo]);
    }

    const order: { id: string; labelKey: string | null; name: string }[] = [
      { id: 'planned', labelKey: 'picker.planned', name: '' },
      { id: 'inbox', labelKey: 'projects.inbox.title', name: '' },
      ...this.projects.sortedProjects().map((p) => ({ id: p.id, labelKey: null, name: p.name })),
    ];
    if (scoped) {
      // The scoped sections in their usual order, then the rest merged (still grouped by project) into "other".
      const rest: Todo[] = [];
      for (const spec of order) {
        if (scoped.has(spec.id)) continue;
        const tasks = groups.get(spec.id);
        if (tasks?.length) rest.push(...this.todos.sortTasks(tasks));
      }
      groups.set('other', rest);
      order.splice(0, order.length, ...order.filter((spec) => scoped.has(spec.id)), {
        id: 'other',
        labelKey: 'picker.other',
        name: '',
      });
    }

    const items: PickItem[] = [];
    const sections: PickSection[] = [];
    const expanded = this.expanded();
    for (const spec of order) {
      const tasks = groups.get(spec.id);
      if (!tasks?.length) continue;
      // "Other" keeps the order it was merged in (by project); everything else is sorted as the app does.
      const sorted = spec.id === 'other' ? tasks : this.todos.sortTasks(tasks);
      // "Other projects" starts folded (no rows at all) until opened or searched; other sections show a few.
      const limit = spec.id === 'other' ? 0 : SECTION_LIMIT;
      const collapsed = !query && !expanded.has(spec.id) && sorted.length > limit;
      const shown = collapsed ? sorted.slice(0, limit) : sorted;
      const rows: PickItem[] = shown.map((todo) => {
        const parts: MetaPart[] = [];
        // Under Planned today and Other projects a row also says which project it belongs to; elsewhere the heading does.
        if ((spec.id === 'planned' || spec.id === 'other') && todo.projectId) {
          const name = projectsById.get(todo.projectId)?.name;
          if (name) parts.push({ text: name, overdue: false });
        }
        const milestone = todo.milestoneId ? milestoneNames.get(todo.milestoneId) : undefined;
        if (milestone) parts.push({ text: milestone, overdue: false });
        if (todo.dueDate) {
          const overdue = todo.dueDate < this.today;
          parts.push({ text: overdue ? '' : formatIso(format, todo.dueDate), overdue });
        }
        if (todo.tags.length) parts.push({ text: `#${todo.tags[0]}`, overdue: false });
        const note = annotate(todo.id);
        const row: PickItem = {
          kind: 'task',
          index: items.length,
          todo,
          meta: parts.slice(0, 2),
          current: todo.id === currentId,
          ...(multiple ? { checked: ticked.has(todo.id) } : {}),
          ...(note ? { note } : {}),
        };
        items.push(row);
        return row;
      });
      if (collapsed) {
        const more: PickItem = { kind: 'more', index: items.length, sectionId: spec.id, hidden: sorted.length - shown.length };
        items.push(more);
        rows.push(more);
      }
      sections.push({ id: spec.id, labelKey: spec.labelKey, name: spec.name, items: rows });
    }

    const taskCount = matches.length;
    let create: PickItem | null = null;
    if (raw) {
      create = { kind: 'create', index: items.length, title: raw, project: this.createTarget()?.name };
      items.push(create);
    }
    return { sections, items, create, taskCount };
  });

  /** What to say above the (possibly only) create row when nothing is listed. */
  readonly emptyKey = computed(() => {
    if (this.view().taskCount) return null;
    return this.pickable().length ? 'picker.noMatch' : 'picker.empty';
  });

  /** `active`, kept inside the list (it can point past the end after the list shrinks); -1 when there are no rows. */
  readonly activeIndex = computed(() => Math.min(this.active(), this.view().items.length - 1));

  readonly activeId = computed(() => (this.activeIndex() >= 0 ? this.optionId(this.activeIndex()) : null));

  constructor() {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockScroll();
    afterNextRender(() => this.searchInput()?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => {
      unlock();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    });
  }

  optionId(index: number): string {
    return `task-picker-opt-${index}`;
  }

  setQuery(value: string): void {
    this.query.set(value);
    this.active.set(0);
  }

  setFilter(next: QuickFilter): void {
    this.filter.set(next);
    this.active.set(0);
  }

  /** Mouse hover moves the highlight too. */
  highlight(index: number): void {
    this.active.set(index);
  }

  activate(item: PickItem): void {
    if (item.kind === 'task' && item.todo) {
      if (this.multiple()) this.toggle(item.todo.id);
      else this.pick.emit(item.todo.id);
    } else if (item.kind === 'more' && item.sectionId) {
      const id = item.sectionId;
      this.expanded.update((set) => new Set(set).add(id));
    } else if (item.kind === 'create' && item.title) {
      const id = this.todos.addTodo({
        title: item.title,
        importance: 'medium',
        urgency: 'medium',
        tags: [],
        projectId: this.createTarget()?.id,
      });
      if (this.multiple()) {
        // Ticked right away; the search is cleared for the next one.
        this.selected.update((list) => [...list, id]);
        this.setQuery('');
      } else {
        this.pick.emit(id);
      }
    }
  }

  private toggle(id: string): void {
    this.selected.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  /** `multiple`: hands over everything ticked (`pick` once per id, then `pickMany`). */
  confirmMany(): void {
    const ids = this.selected();
    if (!ids.length) return;
    for (const id of ids) this.pick.emit(id);
    this.pickMany.emit([...ids]);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    const count = this.view().items.length;
    const current = this.activeIndex();
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(current + 1, count - 1);
        break;
      case 'ArrowUp':
        next = Math.max(current - 1, 0);
        break;
      case 'Home':
        // In a field Home and End move the caret; they jump the highlight only when there is no text to move in.
        if (event.ctrlKey || !this.query()) next = 0;
        break;
      case 'End':
        if (event.ctrlKey || !this.query()) next = count - 1;
        break;
      case 'Enter': {
        event.preventDefault();
        // Ctrl or Cmd + Enter adds what is ticked.
        if (this.multiple() && (event.ctrlKey || event.metaKey)) {
          this.confirmMany();
          return;
        }
        const item = this.view().items[current];
        if (item) this.activate(item);
        return;
      }
      case ' ': {
        // Space ticks the highlighted task, but only while the search is empty: otherwise it is part of the text.
        if (!this.multiple() || this.query()) return;
        const item = this.view().items[current];
        if (item?.kind !== 'task') return;
        event.preventDefault();
        this.activate(item);
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    if (next === null || next < 0) return;
    this.active.set(next);
    afterNextRender(() => document.getElementById(this.optionId(next))?.scrollIntoView({ block: 'nearest' }), {
      injector: this.injector,
    });
  }

  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close.emit();
      return;
    }
    const panel = this.panel()?.nativeElement;
    if (panel) trapTab(event, panel);
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }
}
