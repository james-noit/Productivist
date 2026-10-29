import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatIso } from '../../../lib/dates';
import {
  childrenOf,
  orphansOf,
  projectsWithObjectives,
  rootsOf,
  validPath,
  workOf,
  type Work,
} from '../../../lib/plan-flow-tree';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import type { Horizon, Objective } from '../../../types/flow';
import type { Todo } from '../../../types/todo';
import { IconComponent } from '../icon/icon.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

type Level = 'project' | 'long' | 'medium' | 'short' | 'work';

interface Row {
  objective: Objective;
  done: number;
  total: number;
  date: string | null;
  subKey: string;
  subN: number;
  inList: boolean;
}

interface Crumb {
  label: string;
  /** Path length to go back to; -1 = the project list. */
  to: number;
}

/**
 * Step 1 of Plan my day, "Work on current objectives": a drill-down path finder. One level at a time (project, long,
 * medium, short term), ending in the open tasks that feed a short-term objective, where today's objective is made:
 * tick tasks, name it, *Add to today* (writes `DailyPlanService.objectivesList`, linked to the short-term objective).
 * Dead ends offer to create the missing objective or task.
 */
@Component({
  selector: 'app-plan-flow-objectives',
  standalone: true,
  imports: [NgTemplateOutlet, TranslatePipe, IconComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-flow-objectives.component.html',
  styleUrl: './plan-flow-objectives.component.css',
  host: { '(keydown)': 'onKey($event)' },
})
export class PlanFlowObjectivesComponent {
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly flow = inject(FlowService);
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly settings = inject(SettingsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Open by default when nothing has been typed yet; afterwards the user's choice. */
  readonly open = signal(false);

  // ---- state: the path (local, not persisted) ------------------------------------------------------------------
  private readonly projectRaw = signal<string | null>(null);
  private readonly pathRaw = signal<string[]>([]);
  readonly ticked = signal<ReadonlySet<string>>(new Set());
  private readonly typed = signal<string | null>(null);
  readonly adding = signal(false);
  readonly newTitle = signal('');
  readonly justAdded = signal(false);

  private readonly entries = computed(() =>
    projectsWithObjectives({
      projects: this.projects.sortedProjects(),
      objectives: this.flow.objectives(),
      links: this.flow.links(),
      milestones: this.projects.milestones(),
      todos: this.todos.todos(),
    }),
  );

  readonly multi = computed(() => this.entries().length > 1);

  /** The chosen project (the only one when there is just one); null at the project level. */
  private readonly entry = computed(() => {
    const entries = this.entries();
    if (entries.length === 1) return entries[0];
    return entries.find((e) => e.project.id === this.projectRaw()) ?? null;
  });

  readonly project = computed(() => this.entry()?.project ?? null);

  /** The path cut at the first id that vanished or stopped being active. */
  private readonly path = computed(() => {
    const entry = this.entry();
    return entry ? validPath(entry.graph, this.pathRaw()) : [];
  });

  private readonly pathObjectives = computed(() => {
    const entry = this.entry();
    if (!entry) return [];
    const byId = new Map(entry.graph.objectives.map((o) => [o.id, o] as const));
    return this.path().map((id) => byId.get(id)!);
  });

  private readonly last = computed(() => this.pathObjectives().at(-1) ?? null);

  readonly level = computed<Level>(() => {
    if (!this.entry()) return 'project';
    const last = this.last();
    if (!last) return 'long';
    return last.horizon === 'long' ? 'medium' : last.horizon === 'medium' ? 'short' : 'work';
  });

  readonly crumbs = computed<Crumb[]>(() => {
    const out: Crumb[] = [];
    const project = this.project();
    if (this.multi()) out.push({ label: '', to: -1 });
    if (project && this.multi()) out.push({ label: project.name, to: 0 });
    this.pathObjectives().forEach((o, i) => out.push({ label: o.title, to: i + 1 }));
    return out;
  });

  readonly canUp = computed(() => this.level() !== 'project' && (this.path().length > 0 || this.multi()));

  /** Short-term objective of the Work level. */
  readonly short = computed(() => (this.level() === 'work' ? this.last() : null));

  /** Title used in the heading of the current level. */
  readonly headParam = computed(() => ({ t: this.last()?.title ?? this.project()?.name ?? '' }));

  // ---- the rows of levels 1-4 -----------------------------------------------------------------------------------
  private readonly dateFormat = computed(
    () => new Intl.DateTimeFormat(this.settings.language(), { day: 'numeric', month: 'short' }),
  );

  private readonly inList = computed(
    () => new Set(this.dailyPlan.objectivesList().flatMap((d) => (d.flowObjectiveId ? [d.flowObjectiveId] : []))),
  );

  readonly projectRows = computed(() =>
    this.entries().map((e) => ({
      project: e.project,
      count: e.graph.objectives.filter((o) => o.status === 'active').length,
    })),
  );

  private readonly rowsFor = computed(() => {
    const entry = this.entry();
    if (!entry) return { main: [] as Row[], orphans: [] as Row[] };
    const { graph } = entry;
    const format = this.dateFormat();
    const inList = this.inList();
    const row = (o: Objective): Row => {
      const progress = graph.progress.get(o.id);
      const kids = o.horizon === 'short' ? [] : childrenOf(graph, o);
      let subKey: string;
      let subN: number;
      if (kids.length) {
        subN = kids.length;
        subKey = kids[0].horizon === 'medium' ? 'planningLab.flow.subMedium' : 'planningLab.flow.subShort';
      } else {
        subN = workOf(graph, o.id).count;
        subKey = subN === 1 ? 'planningLab.count.one' : 'planningLab.count.other';
      }
      return {
        objective: o,
        done: progress?.done ?? 0,
        total: progress?.total ?? 0,
        date: o.targetDate ? formatIso(format, o.targetDate) : null,
        subKey,
        subN,
        inList: o.horizon === 'short' && inList.has(o.id),
      };
    };
    const last = this.last();
    if (!last) return { main: rootsOf(graph).map(row), orphans: orphansOf(graph).map(row) };
    return { main: last.horizon === 'short' ? [] : childrenOf(graph, last).map(row), orphans: [] as Row[] };
  });

  readonly rows = computed(() => this.rowsFor().main);
  readonly orphans = computed(() => this.rowsFor().orphans);

  /** What the "add" ghost button at the end of the level creates. */
  readonly addKind = computed<'long' | 'medium' | 'short' | 'task' | null>(() => {
    switch (this.level()) {
      case 'long':
        return 'long';
      case 'medium':
        return 'medium';
      case 'short':
        return 'short';
      case 'work':
        return 'task';
      default:
        return null;
    }
  });

  // ---- the Work level ---------------------------------------------------------------------------------------------
  readonly work = computed<Work>(() => {
    const entry = this.entry();
    const short = this.short();
    return entry && short ? workOf(entry.graph, short.id) : { groups: [], direct: [], count: 0 };
  });

  private readonly workTasks = computed(() => [...this.work().groups.flatMap((g) => g.tasks), ...this.work().direct]);

  /** The draft already made for this short-term objective, if any. */
  readonly existing = computed(() => {
    const short = this.short();
    return short ? (this.dailyPlan.objectivesList().find((d) => d.flowObjectiveId === short.id) ?? null) : null;
  });

  /** Task id -> text of the other draft it is planned in. */
  readonly elsewhere = computed(() => {
    const existing = this.existing();
    const map = new Map<string, string>();
    for (const d of this.dailyPlan.objectivesList()) {
      if (d === existing) continue;
      for (const id of d.taskIds ?? []) map.set(id, d.text);
    }
    return map;
  });

  private readonly suggested = computed(() => {
    const short = this.short();
    if (!short) return '';
    const tasks = this.workTasks().filter((t) => this.ticked().has(t.id));
    if (tasks.length === 1) return tasks[0].title;
    if (tasks.length > 1) {
      const names = this.work().groups.filter((g) => tasks.every((t) => g.tasks.includes(t)));
      if (names.length) return names[0].milestone.name;
    }
    return short.title;
  });

  readonly text = computed(() => this.typed() ?? this.suggested());

  // ---- navigation -----------------------------------------------------------------------------------------------
  private focusFirst(): void {
    afterNextRender(
      () => {
        const root = this.host.nativeElement;
        (root.querySelector<HTMLElement>('[data-first]') ?? root.querySelector<HTMLElement>('.pfo__heading'))?.focus();
      },
      { injector: this.injector },
    );
  }

  private resetWork(): void {
    this.ticked.set(new Set());
    this.typed.set(null);
    this.adding.set(false);
    this.newTitle.set('');
  }

  private enterPath(path: string[], projectId?: string | null): void {
    this.resetWork();
    this.justAdded.set(false);
    if (projectId !== undefined) this.projectRaw.set(projectId);
    this.pathRaw.set(path);
    this.focusFirst();
  }

  chooseProject(id: string): void {
    this.enterPath([], id);
  }

  down(objective: Objective): void {
    const path = [...this.path(), objective.id];
    this.enterPath(path);
    if (objective.horizon !== 'short') return;
    const draft = this.dailyPlan.objectivesList().find((d) => d.flowObjectiveId === objective.id);
    if (!draft) return;
    const open = new Set(workOf(this.entry()!.graph, objective.id).count ? this.openIds(objective.id) : []);
    this.ticked.set(new Set((draft.taskIds ?? []).filter((id) => open.has(id))));
    this.typed.set(draft.text);
  }

  private openIds(shortId: string): string[] {
    const w = workOf(this.entry()!.graph, shortId);
    return [...w.groups.flatMap((g) => g.tasks), ...w.direct].map((t) => t.id);
  }

  goTo(to: number): void {
    if (to < 0) this.enterPath([], null);
    else this.enterPath(this.path().slice(0, to));
  }

  up(): void {
    if (!this.canUp()) return;
    if (this.path().length) this.enterPath(this.path().slice(0, -1));
    else this.enterPath([], null);
  }

  onDetailsToggle(event: Event): void {
    this.open.set((event.target as HTMLDetailsElement).open);
  }

  onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    const typing = target.closest('input, textarea, select, [contenteditable="true"]') !== null;
    if ((event.key === 'Backspace' && !typing && !event.altKey && !event.ctrlKey && !event.metaKey) || (event.key === 'ArrowLeft' && event.altKey)) {
      if (!this.canUp()) return;
      event.preventDefault();
      event.stopPropagation();
      this.up();
    }
  }

  // ---- today's objective ----------------------------------------------------------------------------------------
  toggleTick(task: Todo): void {
    this.ticked.update((set) => {
      const next = new Set(set);
      if (!next.delete(task.id)) next.add(task.id);
      return next;
    });
  }

  onText(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
  }

  addToToday(): void {
    const short = this.short();
    const text = this.text().trim();
    if (!short || !text) return;
    const ids = this.workTasks()
      .map((t) => t.id)
      .filter((id) => this.ticked().has(id));
    const existing = this.existing();
    this.dailyPlan.objectivesList.update((list) => {
      const cleaned = list.map((d) => {
        if (d === existing || !d.taskIds?.some((id) => ids.includes(id))) return d;
        const taskIds = d.taskIds.filter((id) => !ids.includes(id));
        return { ...d, taskIds: taskIds.length ? taskIds : undefined };
      });
      const draft = { text, flowObjectiveId: short.id, ...(ids.length ? { taskIds: ids } : {}) };
      return existing ? cleaned.map((d) => (d === existing ? draft : d)) : [...cleaned, draft];
    });
    this.enterPath(this.path().slice(0, -1));
    this.justAdded.set(true);
  }

  // ---- dead ends: create the missing piece ----------------------------------------------------------------------
  startAdd(): void {
    this.adding.set(true);
    this.newTitle.set('');
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.pfo__add-input')?.focus(), {
      injector: this.injector,
    });
  }

  cancelAdd(event?: Event): void {
    event?.stopPropagation();
    this.adding.set(false);
    this.newTitle.set('');
  }

  onNewTitle(event: Event): void {
    this.newTitle.set((event.target as HTMLInputElement).value);
  }

  submitAdd(event?: Event): void {
    event?.preventDefault();
    const kind = this.addKind();
    const project = this.project();
    const title = this.newTitle().trim();
    if (!kind || !project || !title) return;
    if (kind === 'task') {
      const short = this.short();
      if (!short) return;
      const id = this.todos.addTodo({ title, importance: 'medium', urgency: 'medium', tags: [], projectId: project.id });
      this.flow.link({ kind: 'task', id, projectId: project.id }, short.id);
      this.ticked.update((set) => new Set(set).add(id));
      this.adding.set(false);
      this.newTitle.set('');
      return;
    }
    const created = this.flow.addObjective({ projectId: project.id, title, horizon: kind as Horizon });
    if (!created) return;
    const parent = this.last();
    if (parent) this.flow.link({ kind: 'objective', id: created.id }, parent.id);
    this.enterPath([...this.path(), created.id]);
  }
}
