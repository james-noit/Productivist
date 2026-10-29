import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatIso } from '../../../lib/dates';
import type { FlowGraph } from '../../../lib/flow-graph';
import { buildObjectiveTree, shortObjectiveOfTask, type ObjectiveNode } from '../../../lib/plan-flow-tree';
import { DailyPlanService, type DraftObjective } from '../../../services/daily-plan.service';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import type { Objective } from '../../../types/flow';
import type { Todo } from '../../../types/todo';
import { IconComponent } from '../icon/icon.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * Step 1 of Plan my day, "Work on current objectives": the project objectives (Flow) of every project, from the
 * longest horizon down to the open tasks that feed them. *Work on this today* turns an objective into one of today's
 * objectives (linked to it); *Plan this task* does the same for the task's short-term objective and remembers the
 * task, which step 2 → 3 plan under it. It writes `DailyPlanService.objectivesList` directly.
 */
@Component({
  selector: 'app-plan-flow-objectives',
  standalone: true,
  imports: [NgTemplateOutlet, TranslatePipe, IconComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-flow-objectives.component.html',
  styleUrl: './plan-flow-objectives.component.css',
})
export class PlanFlowObjectivesComponent {
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly flow = inject(FlowService);
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly settings = inject(SettingsService);

  /** Open by default when nothing has been typed yet; afterwards the user's choice. */
  readonly open = signal(this.dailyPlan.objectivesList().length === 0 && !this.dailyPlan.objectiveDraft().trim());

  /** Ids toggled away from the default (everything is expanded by default). */
  private readonly flipped = signal<ReadonlySet<string>>(new Set());

  readonly sections = computed(() =>
    buildObjectiveTree({
      projects: this.projects.sortedProjects(),
      objectives: this.flow.objectives(),
      links: this.flow.links(),
      milestones: this.projects.milestones(),
      todos: this.todos.todos(),
    }),
  );

  private readonly dateFormat = computed(
    () => new Intl.DateTimeFormat(this.settings.language(), { day: 'numeric', month: 'short' }),
  );

  /** Objective id -> its formatted target date, for every shown objective. */
  readonly dates = computed(() => {
    const format = this.dateFormat();
    const map = new Map<string, string>();
    for (const section of this.sections()) {
      for (const objective of section.graph.objectives) {
        if (objective.targetDate) map.set(objective.id, formatIso(format, objective.targetDate));
      }
    }
    return map;
  });

  /** Project objectives already in today's list, and the tasks picked so far. */
  readonly added = computed(() => new Set(this.dailyPlan.objectivesList().flatMap((d) => (d.flowObjectiveId ? [d.flowObjectiveId] : []))));
  readonly picked = computed(() => new Set(this.dailyPlan.objectivesList().flatMap((d) => d.taskIds ?? [])));

  isOpen(id: string): boolean {
    return !this.flipped().has(id);
  }

  toggle(id: string): void {
    this.flipped.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  onDetailsToggle(event: Event): void {
    this.open.set((event.target as HTMLDetailsElement).open);
  }

  /** Short-term objectives, and any objective with nothing shorter under it, can be worked on directly. */
  canWork(node: ObjectiveNode): boolean {
    return node.objective.horizon === 'short' || node.children.length === 0;
  }

  workToday(objective: Objective): void {
    this.dailyPlan.objectivesList.update((list) =>
      list.some((d) => d.flowObjectiveId === objective.id)
        ? list.filter((d) => d.flowObjectiveId !== objective.id)
        : [...list, { text: objective.title, flowObjectiveId: objective.id }],
    );
  }

  /** Picks (or drops) a task: adds its short-term objective to today's list if needed, with the task attached. */
  planTask(task: Todo, node: ObjectiveNode, graph: FlowGraph): void {
    const target = node.objective.horizon === 'short' ? node.objective : (shortObjectiveOfTask(graph, task.id) ?? node.objective);
    this.dailyPlan.objectivesList.update((list) => {
      const draft = list.find((d) => d.flowObjectiveId === target.id);
      if (!draft) return [...list, { text: target.title, flowObjectiveId: target.id, taskIds: [task.id] }];
      const ids = draft.taskIds ?? [];
      const taskIds = ids.includes(task.id) ? ids.filter((id) => id !== task.id) : [...ids, task.id];
      const next: DraftObjective = { ...draft, taskIds };
      return list.map((d) => (d === draft ? next : d));
    });
  }
}
