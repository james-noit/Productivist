import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatIso, todayIso } from '../../../lib/dates';
import { buildFlowGraph, chainOf, milestoneKey, objectiveKey, taskKey, type FlowGraph, type Progress, type WorkCard } from '../../../lib/flow-graph';
import { horizonRank, type FlowSource } from '../../../lib/flow-rules';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import type { Horizon, Objective, ObjectiveStatus } from '../../../types/flow';
import type { Project } from '../../../types/project';
import type { Todo } from '../../../types/todo';
import { FlowLinkMenuComponent } from '../flow-link-menu/flow-link-menu.component';
import { FlowViewState } from '../project-flow/flow-view-state';

type RowKind = 'objective' | 'milestone' | 'card' | 'task' | 'section';

/** One line of the outline, already flattened and indented. */
interface OutlineRow {
  /** Unique position in the tree (the same node can appear under several objectives). */
  path: string;
  kind: RowKind;
  id: string;
  title: string;
  depth: number;
  hasChildren: boolean;
  open: boolean;
  /** What the ⋯ menu links from; null for rows that cannot be linked (sections, the "No milestone" card). */
  source: FlowSource | null;
  progress: Progress | null;
  horizon: Horizon | null;
  status: ObjectiveStatus | null;
  target: string | null;
  overdue: boolean;
  done: boolean;
  count: number | null;
}

/**
 * The Flow view as an indented tree, for phones and for keyboard and screen-reader users: objectives from the
 * longest horizon down (each listing the objectives, milestones and tasks that feed it, with progress), then
 * the work that serves nothing yet. Every title and every ⋯ link menu is a real button, so tasks are reachable
 * without a pointer. It builds the same graph as the diagram and shares its filters and editors (it only
 * reports what to edit; `project-flow` owns the modals).
 */
@Component({
  selector: 'app-flow-outline',
  standalone: true,
  imports: [TranslatePipe, FlowLinkMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-outline.component.html',
  styleUrl: './flow-outline.component.css',
})
export class FlowOutlineComponent {
  private readonly flow = inject(FlowService);
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly settings = inject(SettingsService);
  private readonly view = inject(ViewService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly state = inject(FlowViewState);

  readonly project = input.required<Project>();

  /** The empty state's button: start the first objective (Short term). */
  readonly addObjective = output<void>();
  readonly editObjective = output<string>();
  readonly editMilestone = output<string>();
  readonly editTask = output<string>();

  /** Paths whose open state differs from the default (objectives and the unlinked-work cards open, linked milestones closed). */
  private readonly flipped = signal<ReadonlySet<string>>(new Set());
  /** Path of the row whose link menu is open. */
  protected readonly menuPath = signal<string | null>(null);

  private readonly dateFormat = computed(
    () => new Intl.DateTimeFormat(this.settings.language(), { day: 'numeric', month: 'short', year: 'numeric' }),
  );

  private readonly graph = computed<FlowGraph>(() => {
    const projectId = this.project().id;
    return buildFlowGraph({
      projectId,
      objectives: this.flow.objectivesByProject().get(projectId) ?? [],
      links: this.flow.linksByProject().get(projectId) ?? [],
      milestones: this.projects
        .milestones()
        .filter((m) => m.projectId === projectId)
        .sort((a, b) => a.order - b.order),
      todos: this.todos.todos().filter((t) => t.projectId === projectId),
      showDone: this.view.showDoneTasks(),
    });
  });

  protected readonly hasObjectives = computed(() => this.graph().objectives.length > 0);

  /** The whole outline, flattened. */
  protected readonly rows = computed<OutlineRow[]>(() => {
    const graph = this.graph();
    const projectId = this.project().id;
    const flipped = this.flipped();
    const format = this.dateFormat();
    const today = todayIso();
    const out: OutlineRow[] = [];

    const isOpen = (path: string, byDefault: boolean) => byDefault !== flipped.has(path);
    const cardOf = new Map(graph.cards.map((c) => [c.key, c]));
    const taskById = new Map<string, Todo>();
    for (const card of graph.cards) for (const t of card.rows) taskById.set(t.id, t);

    const visible = new Map<string, Objective>();
    for (const o of graph.objectives) if (this.state.shows(o)) visible.set(o.id, o);
    const byRank = (a: Objective, b: Objective) => horizonRank(b.horizon) - horizonRank(a.horizon) || a.order - b.order;

    const cardProgress = (card: WorkCard): Progress => ({
      done: card.done,
      total: card.total,
      percent: card.total ? Math.round((card.done / card.total) * 100) : 0,
    });
    const blank = {
      progress: null,
      horizon: null,
      status: null,
      target: null,
      overdue: false,
      done: false,
      count: null,
      source: null,
    } as const;

    const pushTask = (todo: Todo, path: string, depth: number) =>
      out.push({
        ...blank,
        path,
        kind: 'task',
        id: todo.id,
        title: todo.title,
        depth,
        hasChildren: false,
        open: false,
        source: { kind: 'task', id: todo.id, projectId },
        done: todo.done,
      });

    const pushCard = (card: WorkCard, path: string, depth: number, byDefault: boolean, tasks: readonly Todo[]) => {
      const open = isOpen(path, byDefault);
      out.push({
        ...blank,
        path,
        kind: card.milestone ? 'milestone' : 'card',
        id: card.milestone?.id ?? card.key,
        title: card.milestone?.name ?? '',
        depth,
        hasChildren: tasks.length > 0,
        open,
        source: card.milestone ? { kind: 'milestone', id: card.milestone.id, projectId } : null,
        progress: cardProgress(card),
      });
      if (open) for (const t of tasks) pushTask(t, `${path}>${taskKey(t.id)}`, depth + 1);
    };

    const pushObjective = (objective: Objective, parentPath: string, depth: number, trail: ReadonlySet<string>) => {
      const path = `${parentPath}>${objectiveKey(objective.id)}`;
      const incoming = graph.byTarget.get(objective.id) ?? [];
      const subs = incoming
        .filter((l) => l.fromKind === 'objective' && visible.has(l.fromId) && !trail.has(l.fromId))
        .map((l) => visible.get(l.fromId)!)
        .sort(byRank);
      const cards = incoming.filter((l) => l.fromKind === 'milestone').flatMap((l) => cardOf.get(milestoneKey(l.fromId)) ?? []);
      const tasks = incoming.filter((l) => l.fromKind === 'task').flatMap((l) => taskById.get(l.fromId) ?? []);
      const open = isOpen(path, true);
      out.push({
        ...blank,
        path,
        kind: 'objective',
        id: objective.id,
        title: objective.title,
        depth,
        hasChildren: subs.length + cards.length + tasks.length > 0,
        open,
        source: { kind: 'objective', id: objective.id },
        progress: graph.progress.get(objective.id) ?? { done: 0, total: 0, percent: 0 },
        horizon: objective.horizon,
        status: objective.status,
        target: objective.targetDate ? formatIso(format, objective.targetDate) : null,
        overdue: objective.status === 'active' && !!objective.targetDate && objective.targetDate < today,
      });
      if (!open) return;
      const next = new Set(trail).add(objective.id);
      for (const sub of subs) pushObjective(sub, path, depth + 1, next);
      for (const card of cards) pushCard(card, `${path}>${card.key}`, depth + 1, false, card.rows);
      for (const todo of tasks) pushTask(todo, `${path}>${taskKey(todo.id)}`, depth + 1);
    };

    // Roots: the shown objectives that feed no other shown objective, longest horizon first.
    const roots = [...visible.values()]
      .filter((o) => !graph.bySource.get(objectiveKey(o.id))?.some((l) => visible.has(l.toObjectiveId)))
      .sort(byRank);
    for (const root of roots) pushObjective(root, '', 0, new Set());

    // Work that serves no objective yet: where the next link starts.
    const unlinkedTasks = new Map<string, Todo[]>();
    let unlinkedCount = 0;
    for (const card of graph.cards) {
      const list = card.rows.filter((t) => ![...chainOf(graph, taskKey(t.id)).nodes].some((k) => k.startsWith('objective:') && visible.has(k.slice('objective:'.length))));
      unlinkedTasks.set(card.key, list);
      unlinkedCount += list.length;
    }
    const unlinkedCards = graph.cards.filter((card) => {
      const tasks = unlinkedTasks.get(card.key)!;
      if (tasks.length) return true;
      return !!card.milestone && card.total === 0 && !graph.bySource.has(card.key);
    });
    if (unlinkedCards.length) {
      out.push({
        ...blank,
        path: 'unlinked',
        kind: 'section',
        id: 'unlinked',
        title: '',
        depth: 0,
        hasChildren: false,
        open: true,
        count: unlinkedCount,
      });
      for (const card of unlinkedCards) pushCard(card, `unlinked>${card.key}`, 1, true, unlinkedTasks.get(card.key)!);
    }
    return out;
  });

  protected toggle(row: OutlineRow): void {
    this.flipped.update((set) => {
      const next = new Set(set);
      if (!next.delete(row.path)) next.add(row.path);
      return next;
    });
  }

  protected edit(row: OutlineRow): void {
    if (row.kind === 'objective') this.editObjective.emit(row.id);
    else if (row.kind === 'milestone') this.editMilestone.emit(row.id);
    else if (row.kind === 'task') this.editTask.emit(row.id);
  }

  protected toggleMenu(row: OutlineRow): void {
    this.menuPath.update((path) => (path === row.path ? null : row.path));
  }

  /** The row is gone with its objective, so there is no trigger to go back to: focus lands on the list. */
  protected onObjectiveDeleted(): void {
    this.menuPath.set(null);
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('.flow-outline')?.focus({ preventScroll: true }));
  }

  protected closeMenu(path: string, restoreFocus: boolean): void {
    if (this.menuPath() !== path) return;
    this.menuPath.set(null);
    if (restoreFocus) {
      const triggers = this.host.nativeElement.querySelectorAll<HTMLElement>('[data-menu-trigger]');
      Array.from(triggers)
        .find((el) => el.dataset['menuTrigger'] === path)
        ?.focus();
    }
  }
}
