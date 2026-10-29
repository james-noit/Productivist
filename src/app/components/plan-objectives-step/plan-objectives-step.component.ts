import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { formatIso } from '../../../lib/dates';
import { buildFlowGraph, type FlowGraph } from '../../../lib/flow-graph';
import { byHorizonThenPrecedence, chainUp, taskIdsFeeding } from '../../../lib/plan-flow-tree';
import { compareNextUp } from '../../../lib/project-cards';
import { DailyPlanService, UNASSIGNED_GROUP_ID } from '../../../services/daily-plan.service';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { RecurrenceService } from '../../../services/recurrence.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { ContextMenuHostDirective, type ContextRequest } from '../../directives/context-menu-host.directive';
import { IconComponent } from '../icon/icon.component';
import { KebabMenuComponent } from '../kebab-menu/kebab-menu.component';
import { PlanSportaskSwitchComponent } from '../plan-sportask-switch/plan-sportask-switch.component';
import { PlanContextMenuComponent, type PlanContextKind } from '../plan-context-menu/plan-context-menu.component';
import { RepeatMarkComponent } from '../repeat-mark/repeat-mark.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import { TaskPickerComponent } from '../task-picker/task-picker.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { Todo } from '../../../types/todo';

/** Suggestions per objective. */
const SUGGESTION_LIMIT = 4;

interface MetaPart {
  text: string;
  overdue: boolean;
}

interface PlanRow {
  todo: Todo;
  meta: MetaPart[];
  /** The task already feeds the card's project objective. */
  feeds: boolean;
  /** It does not yet, and could (same project): offers "Link to ...". */
  canLink: boolean;
}

/** The project objective a card is linked to, with the chain above it (short <- medium <- long titles). */
interface CardFlow {
  id: string;
  projectId: string;
  title: string;
  chain: string[];
}

interface ConnectGroup {
  name: string;
  items: { id: string; title: string }[];
}

interface PlanProject {
  id: string;
  icon: string;
  /** null for the Inbox, whose name is translated in the template. */
  name: string | null;
}

interface ObjectiveCard {
  id: string;
  text: string;
  rows: PlanRow[];
  suggestions: Todo[];
  projects: PlanProject[];
  pomodoros: number;
  flow: CardFlow | null;
  /** Active short-term project objectives an unlinked card may connect to, grouped by project. */
  connect: ConnectGroup[];
}

interface PickerConfig {
  objectiveId: string;
  isPickable: (todoId: string) => boolean;
  annotate: (todoId: string) => string | null;
  scope: string[] | null;
  createProjectId: string | null;
}

/** Where a dragged row would land: before `beforeId` in an objective's list, or last when null. */
interface DropSpot {
  objectiveId: string;
  beforeId: string | null;
}

/** One open context menu. `id` is new each time, so a menu opened over another is a fresh component. */
interface PlanContextRequest {
  id: number;
  x: number;
  y: number;
  kind: PlanContextKind;
  taskId: string | null;
  objectiveId: string | null;
  returnFocus: HTMLElement | null;
}

/**
 * Step 3 of Plan my day: one card per objective, in the order of step 1. Each card lists the tasks planned for the
 * objective (reorderable: that order is the execution order of the Planned tasks list and the lots), the projects
 * linked to it in step 2 and a few suggestions from them; tasks come in through the common `task-picker`
 * (scoped to those projects), the suggestions or an inline new-task field. Only the planned rows are draggable
 * (by their grip, with a small title chip as the drag image); the row menu and Alt + Up/Down are the touch and
 * keyboard paths, and a right-click, long-press or Menu key on a planned row, a suggestion or a card opens
 * `plan-context-menu` (lazy; `appContextMenuHost` on the root, `data-ctx` on the three targets, the browser's own
 * menu everywhere else). Everything the template reads is in the `cards` computed.
 */
@Component({
  selector: 'app-plan-objectives-step',
  standalone: true,
  imports: [
    TranslatePipe,
    IconComponent,
    UiIconComponent,
    KebabMenuComponent,
    RepeatMarkComponent,
    TaskPickerComponent,
    TaskDetailModalComponent,
    ContextMenuHostDirective,
    PlanContextMenuComponent,
    PlanSportaskSwitchComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-objectives-step.component.html',
  styleUrl: './plan-objectives-step.component.css',
})
export class PlanObjectivesStepComponent {
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly flow = inject(FlowService);
  private readonly recurrences = inject(RecurrenceService);
  private readonly settings = inject(SettingsService);
  private readonly translate = inject(TranslateService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ghost = viewChild<ElementRef<HTMLElement>>('ghost');

  /** The wizard owns navigation and the "replace your planned tasks?" question; this step only asks. */
  readonly back = output<void>();
  readonly startLots = output<void>();
  readonly startPomodoro = output<void>();

  private readonly dateFormat = computed(
    () => new Intl.DateTimeFormat(this.settings.language(), { day: 'numeric', month: 'short' }),
  );

  /** Every objective's card, built in one pass: its planned rows, suggestions, projects and estimate. */
  readonly cards = computed<ObjectiveCard[]>(() => {
    const objectives = this.dailyPlan.objectives();
    const assignments = this.dailyPlan.assignments();
    const links = this.dailyPlan.projectAssignments();
    const todos = this.todos.todos();
    const projectsById = new Map(this.projects.projects().map((p) => [p.id, p]));
    const milestoneNames = new Map(this.projects.milestones().map((m) => [m.id, m.name]));
    const todosById = new Map(todos.map((t) => [t.id, t]));
    const format = this.dateFormat();
    const today = this.recurrences.today();

    // The open tasks of each objective, in the execution order.
    const plannedBy = new Map<string, Todo[]>();
    for (const id of this.dailyPlan.plannedTaskIds()) {
      const todo = todosById.get(id);
      const objectiveId = assignments[id];
      if (!todo || todo.done || !objectiveId) continue;
      const list = plannedBy.get(objectiveId);
      if (list) list.push(todo);
      else plannedBy.set(objectiveId, [todo]);
    }

    // The best few open, unplanned tasks of each project (the Inbox under its group id), in "next up" order.
    const byNextUp = compareNextUp(today);
    const free = new Map<string, Todo[]>();
    for (const todo of todos) {
      if (todo.done || assignments[todo.id]) continue;
      const key = todo.projectId && projectsById.has(todo.projectId) ? todo.projectId : UNASSIGNED_GROUP_ID;
      const list = free.get(key);
      if (list) list.push(todo);
      else free.set(key, [todo]);
    }
    for (const [key, list] of free) free.set(key, list.sort(byNextUp).slice(0, SUGGESTION_LIMIT));

    // Project objectives: one graph per project involved, built on demand.
    const flowObjectives = this.flow.objectives();
    const flowById = new Map(flowObjectives.map((o) => [o.id, o] as const));
    const flowLinks = this.flow.links();
    const graphs = new Map<string, FlowGraph>();
    const graphOf = (projectId: string): FlowGraph => {
      let graph = graphs.get(projectId);
      if (!graph) {
        graph = buildFlowGraph({
          projectId,
          objectives: flowObjectives.filter((o) => o.projectId === projectId),
          links: flowLinks.filter((l) => l.projectId === projectId),
          milestones: this.projects.milestones().filter((m) => m.projectId === projectId),
          todos: todos.filter((t) => t.projectId === projectId),
          showDone: true,
        });
        graphs.set(projectId, graph);
      }
      return graph;
    };
    const activeShort = flowObjectives.filter((o) => o.status === 'active' && o.horizon === 'short').sort(byHorizonThenPrecedence);

    return objectives.map((objective) => {
      const linkedFlow = objective.flowObjectiveId ? flowById.get(objective.flowObjectiveId) : undefined;
      const feeding = linkedFlow ? taskIdsFeeding(graphOf(linkedFlow.projectId), linkedFlow.id) : null;
      const flow: CardFlow | null = linkedFlow
        ? {
            id: linkedFlow.id,
            projectId: linkedFlow.projectId,
            title: linkedFlow.title,
            chain: [linkedFlow.title, ...chainUp(graphOf(linkedFlow.projectId), linkedFlow.id).map((o) => o.title)],
          }
        : null;
      const linked: PlanProject[] = [];
      const suggestions: Todo[] = [];
      for (const id of links[objective.id] ?? []) {
        if (id === UNASSIGNED_GROUP_ID) linked.push({ id, icon: 'inbox', name: null });
        else {
          const project = projectsById.get(id);
          if (project) linked.push({ id, icon: project.icon, name: project.name });
          else continue;
        }
        suggestions.push(...(free.get(id) ?? []));
      }
      const tasks = plannedBy.get(objective.id) ?? [];
      const rows = tasks.map((todo): PlanRow => {
        const meta: MetaPart[] = [];
        // A card with several projects says which one a task belongs to; with one the header already does.
        const project = linked.length > 1 && todo.projectId ? projectsById.get(todo.projectId)?.name : undefined;
        if (project) meta.push({ text: project, overdue: false });
        const milestone = todo.milestoneId ? milestoneNames.get(todo.milestoneId) : undefined;
        if (milestone) meta.push({ text: milestone, overdue: false });
        if (todo.dueDate) {
          const overdue = todo.dueDate < today;
          meta.push({ text: overdue ? '' : formatIso(format, todo.dueDate), overdue });
        }
        const feeds = !!feeding?.has(todo.id);
        return { todo, meta, feeds, canLink: !!flow && !feeds && todo.projectId === flow.projectId };
      });
      // Linked: the open tasks that feed the project objective come first.
      let ranked = suggestions.sort(byNextUp);
      if (feeding) {
        const first = [...feeding]
          .map((id) => todosById.get(id))
          .filter((t): t is Todo => !!t && !t.done && !assignments[t.id])
          .sort(byNextUp);
        ranked = [...first, ...ranked.filter((t) => !feeding.has(t.id))];
      }
      let connect: ConnectGroup[] = [];
      if (!flow && activeShort.length) {
        const mine = new Set(linked.map((p) => p.id));
        const near = activeShort.filter((o) => mine.has(o.projectId));
        const pool = near.length ? near : activeShort;
        const byProject = new Map<string, ConnectGroup>();
        for (const o of pool) {
          const group = byProject.get(o.projectId);
          const item = { id: o.id, title: o.title };
          if (group) group.items.push(item);
          else byProject.set(o.projectId, { name: projectsById.get(o.projectId)?.name ?? '', items: [item] });
        }
        connect = [...byProject.values()];
      }
      return {
        id: objective.id,
        text: objective.text,
        rows,
        suggestions: ranked.slice(0, SUGGESTION_LIMIT),
        projects: linked,
        pomodoros: tasks.reduce((sum, t) => sum + (t.pomodorosForTermination ?? 1), 0),
        flow,
        connect,
      };
    });
  });

  /** The footer's numbers: planned tasks, the pomodoros they take, the time that is and the objectives still empty. */
  readonly totals = computed(() => {
    let tasks = 0;
    let pomodoros = 0;
    let empty = 0;
    for (const card of this.cards()) {
      tasks += card.rows.length;
      pomodoros += card.pomodoros;
      if (!card.rows.length) empty++;
    }
    const minutes = Math.round((pomodoros * this.settings.focusSeconds()) / 60);
    const time = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
    return { tasks, pomodoros, empty, time };
  });

  // --- Adding: the picker, the suggestions and the inline new-task field ---

  private readonly pickerFor = signal<string | null>(null);
  readonly picker = computed<PickerConfig | null>(() => {
    const objectiveId = this.pickerFor();
    const card = objectiveId ? this.cards().find((c) => c.id === objectiveId) : undefined;
    if (!card) return null;
    const ids = card.projects.map((p) => p.id);
    const only = ids.length === 1 && ids[0] !== UNASSIGNED_GROUP_ID ? ids[0] : null;
    return {
      objectiveId: card.id,
      // What is already planned in this objective is hidden; what is planned in another is offered, and moves.
      isPickable: (todoId) => this.dailyPlan.assignments()[todoId] !== card.id,
      annotate: (todoId) => {
        const other = this.dailyPlan.assignments()[todoId];
        const text = other && other !== card.id ? this.dailyPlan.objectives().find((o) => o.id === other)?.text : undefined;
        return text ? this.translate.instant('planningLab.inObjective', { objective: text }) : null;
      },
      scope: ids.length ? ids : null,
      createProjectId: only,
    };
  });

  openPicker(objectiveId: string): void {
    this.pickerFor.set(objectiveId);
  }

  closePicker(): void {
    this.pickerFor.set(null);
  }

  /** The picker's ticked tasks: planned here (moved if they were planned elsewhere), their projects linked here. */
  addMany(objectiveId: string, ids: readonly string[]): void {
    this.closePicker();
    for (const id of ids) this.plan(id, objectiveId);
  }

  addSuggestion(todo: Todo, objectiveId: string): void {
    this.plan(todo.id, objectiveId);
  }

  /** Plans a task and links its project to the objective when step 2 had not, so the two steps agree. */
  private plan(todoId: string, objectiveId: string): void {
    const todo = this.todos.todos().find((t) => t.id === todoId);
    if (!todo) return;
    const project = todo.projectId && this.projects.projects().some((p) => p.id === todo.projectId) ? todo.projectId : UNASSIGNED_GROUP_ID;
    this.dailyPlan.assignProjectToObjective(project, objectiveId);
    this.dailyPlan.assignTask(todoId, objectiveId);
  }

  readonly newFor = signal<string | null>(null);
  readonly newTitle = signal('');
  readonly newProject = signal(UNASSIGNED_GROUP_ID);

  openNew(card: ObjectiveCard): void {
    this.newFor.set(card.id);
    this.newTitle.set('');
    this.newProject.set(card.projects.find((p) => p.id !== UNASSIGNED_GROUP_ID)?.id ?? UNASSIGNED_GROUP_ID);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.pstep__new-input')?.focus(), {
      injector: this.injector,
    });
  }

  closeNew(): void {
    this.newFor.set(null);
  }

  onNewKeydown(event: KeyboardEvent, card: ObjectiveCard): void {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      // Only the field: the modal behind it must stay open.
      event.preventDefault();
      event.stopPropagation();
      this.closeNew();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.submitNew(card);
    }
  }

  submitNew(card: ObjectiveCard): void {
    const title = this.newTitle().trim();
    if (!title) return;
    const project = this.newProject();
    const id = this.todos.addTodo({
      title,
      importance: 'medium',
      urgency: 'medium',
      tags: [],
      projectId: project === UNASSIGNED_GROUP_ID ? undefined : project,
    });
    this.dailyPlan.assignProjectToObjective(project, card.id);
    this.dailyPlan.assignTask(id, card.id);
    // A task typed under a linked card also feeds its project objective (links never cross projects; a refusal is ignored).
    if (card.flow && project === card.flow.projectId) this.flow.link({ kind: 'task', id, projectId: project }, card.flow.id);
    this.newTitle.set('');
  }

  // --- Project objective of a card: connect, unlink, link a task ---

  connectFlow(card: ObjectiveCard, flowObjectiveId: string): void {
    const target = this.flow.objectives().find((o) => o.id === flowObjectiveId);
    if (!target) return;
    this.dailyPlan.linkFlowObjective(card.id, flowObjectiveId);
    this.dailyPlan.assignProjectToObjective(target.projectId, card.id);
  }

  unlinkFlow(card: ObjectiveCard): void {
    this.dailyPlan.linkFlowObjective(card.id, null);
  }

  /** Makes a planned task feed the card's project objective. */
  linkTask(todo: Todo, card: ObjectiveCard): void {
    if (card.flow && todo.projectId) this.flow.link({ kind: 'task', id: todo.id, projectId: todo.projectId }, card.flow.id);
  }

  linkTaskFromMenu(taskId: string, objectiveId: string): void {
    const todo = this.todos.todos().find((t) => t.id === taskId);
    const card = this.cards().find((c) => c.id === objectiveId);
    if (todo && card) this.linkTask(todo, card);
    this.focusAfter(taskId, objectiveId);
  }

  // --- A planned row: remove, move, open ---

  readonly movingId = signal<string | null>(null);
  readonly detailId = signal<string | null>(null);
  readonly detailTodo = computed(() => {
    const id = this.detailId();
    return id ? (this.todos.todos().find((t) => t.id === id) ?? null) : null;
  });

  remove(todoId: string): void {
    this.dailyPlan.unassignTask(todoId);
  }

  moveToObjective(todoId: string, objectiveId: string): void {
    this.dailyPlan.moveTask(todoId, objectiveId, null);
    this.movingId.set(null);
  }

  /** Alt + Up/Down moves the row within its objective, from any control inside the row. */
  onRowKeydown(event: KeyboardEvent, card: ObjectiveCard, index: number): void {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    // The row's own menu uses the arrows to move between its items.
    if (event.target instanceof HTMLElement && event.target.closest('.kebab__panel')) return;
    event.preventDefault();
    const rows = card.rows;
    const id = rows[index].todo.id;
    if (event.key === 'ArrowUp') {
      if (index === 0) return;
      this.dailyPlan.moveTask(id, card.id, rows[index - 1].todo.id);
    } else {
      if (index === rows.length - 1) return;
      this.dailyPlan.moveTask(id, card.id, rows[index + 2]?.todo.id ?? null);
    }
    // Re-ordering moves the row's elements, which drops focus: put it back on the title.
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`[data-task="${CSS.escape(id)}"] .pstep__title`)?.focus(),
      { injector: this.injector },
    );
  }

  // --- Drag and drop (the planned rows only) ---

  readonly dragId = signal<string | null>(null);
  readonly drop = signal<DropSpot | null>(null);

  onDragStart(event: DragEvent, todo: Todo): void {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    // Firefox (and Thunderbird) only start a drag that carries data.
    transfer.setData('text/plain', todo.id);
    transfer.effectAllowed = 'move';
    // The drag image is a small chip with the title, never the row (and whatever it contains).
    const ghost = this.ghost()?.nativeElement;
    if (ghost) {
      ghost.textContent = todo.title;
      transfer.setDragImage(ghost, 12, 12);
    }
    this.dragId.set(todo.id);
  }

  onDragEnd(): void {
    this.dragId.set(null);
    this.drop.set(null);
  }

  /** While a row is over a card, work out which row it would land before (null: at the end). */
  onDragOver(event: DragEvent, card: ObjectiveCard): void {
    if (!this.dragId()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    let before: string | null = null;
    for (const row of (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-ctx="row"]')) {
      const box = row.getBoundingClientRect();
      if (event.clientY < box.top + box.height / 2) {
        before = row.dataset['task'] ?? null;
        break;
      }
    }
    const spot = this.drop();
    if (spot?.objectiveId !== card.id || spot.beforeId !== before) this.drop.set({ objectiveId: card.id, beforeId: before });
  }

  onDragLeave(event: DragEvent, card: ObjectiveCard): void {
    const next = event.relatedTarget;
    if (next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) return;
    if (this.drop()?.objectiveId === card.id) this.drop.set(null);
  }

  onDrop(event: DragEvent, card: ObjectiveCard): void {
    const id = this.dragId();
    const spot = this.drop();
    this.onDragEnd();
    if (!id || !this.dailyPlan.assignments()[id]) return;
    event.preventDefault();
    const before = spot?.objectiveId === card.id ? spot.beforeId : null;
    if (before !== id) this.dailyPlan.moveTask(id, card.id, before);
  }

  // --- Context menu ---

  readonly contextMenu = signal<PlanContextRequest | null>(null);
  /** The list the template loops over, so a new request re-creates the menu. */
  protected readonly contextMenus = computed(() => {
    const menu = this.contextMenu();
    return menu ? [menu] : [];
  });
  private menuSeq = 0;
  /** Where focus goes back to once the menu has closed (a dialog it opens hands focus back there). */
  private menuReturnFocus: HTMLElement | null = null;

  onContext(request: ContextRequest): void {
    const target = request.target;
    const kind = target?.dataset['ctx'];
    if (!target || (kind !== 'row' && kind !== 'suggestion' && kind !== 'objective')) return;
    let returnFocus = request.returnFocus;
    // A press on a card's background: back to its Add tasks button rather than the first control in the card.
    if (kind === 'objective' && !(returnFocus && returnFocus === document.activeElement)) {
      returnFocus = target.querySelector<HTMLElement>('.pstep__add .button-ghost') ?? returnFocus;
    }
    this.contextMenu.set({
      id: ++this.menuSeq,
      x: request.x,
      y: request.y,
      kind,
      taskId: target.dataset['task'] ?? null,
      objectiveId: target.dataset['objective'] ?? null,
      returnFocus,
    });
  }

  closeContext(): void {
    this.menuReturnFocus = this.contextMenu()?.returnFocus ?? null;
    this.contextMenu.set(null);
  }

  /** The menu is gone and a dialog is about to open: it takes the focus that is now on `<body>` as its opener. */
  private restoreFocus(): void {
    const target = this.menuReturnFocus;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }

  openFromMenu(todoId: string): void {
    this.restoreFocus();
    this.detailId.set(todoId);
  }

  addTasksFromMenu(objectiveId: string): void {
    this.restoreFocus();
    this.openPicker(objectiveId);
  }

  newTaskFromMenu(objectiveId: string): void {
    const card = this.cards().find((c) => c.id === objectiveId);
    if (card) this.openNew(card);
  }

  addAllFromMenu(objectiveId: string): void {
    const card = this.cards().find((c) => c.id === objectiveId);
    if (!card) return;
    for (const todo of card.suggestions) this.plan(todo.id, objectiveId);
    this.focusAfter(card.suggestions[0]?.id ?? null, objectiveId);
  }

  changeProjectsFromMenu(): void {
    this.back.emit();
  }

  planFromMenu(taskId: string, objectiveId: string): void {
    this.plan(taskId, objectiveId);
    this.focusAfter(taskId, objectiveId);
  }

  /** After a menu action: the task's title if it is still on a card, else the objective's Add tasks button. */
  focusAfter(taskId: string | null, objectiveId: string): void {
    afterNextRender(
      () => {
        const root = this.host.nativeElement;
        const title = taskId ? root.querySelector<HTMLElement>(`[data-ctx="row"][data-task="${CSS.escape(taskId)}"] .pstep__title`) : null;
        const add = root.querySelector<HTMLElement>(`[data-ctx="objective"][data-objective="${CSS.escape(objectiveId)}"] .pstep__add .button-ghost`);
        (title ?? add)?.focus();
      },
      { injector: this.injector },
    );
  }

  // --- Footer ---

  /** Tasks deleted since they were planned must not reach the lots or the Planned tasks list. */
  private pruneDeleted(): void {
    const known = new Set(this.todos.todos().map((t) => t.id));
    for (const id of Object.keys(this.dailyPlan.assignments())) if (!known.has(id)) this.dailyPlan.unassignTask(id);
  }

  goLots(): void {
    this.pruneDeleted();
    this.startLots.emit();
  }

  goPomodoro(): void {
    this.pruneDeleted();
    this.startPomodoro.emit();
  }
}
