import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { cardX } from '../../../lib/flow-geometry';
import { HORIZONS } from '../../../lib/flow-rules';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import type { Horizon, Objective, ObjectiveStatus } from '../../../types/flow';
import type { Project } from '../../../types/project';
import { FlowCanvasComponent } from '../flow-canvas/flow-canvas.component';
import { FlowOutlineComponent } from '../flow-outline/flow-outline.component';
import { MilestoneDatesModalComponent } from '../milestone-dates-modal/milestone-dates-modal.component';
import { ObjectiveModalComponent } from '../objective-modal/objective-modal.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';

/** How the Flow presentation shows its graph: the pannable diagram, or the same graph as an indented outline. */
type FlowMode = 'diagram' | 'outline';

/** Below this viewport width the view opens in Outline: a pannable diagram is awkward on a phone. */
const SMALL_SCREEN = '(max-width: 700px)';

const STATUSES: readonly ObjectiveStatus[] = ['active', 'achieved', 'dropped'];

/** The objective editor's state: the objective being edited (null = new), the horizon a new one starts in, and its drop height. */
interface ObjectiveEditor {
  id: string | null;
  horizon: Horizon;
  y: number | null;
}

/**
 * The Flow presentation of a project: where its work flows into its objectives. This component owns the
 * toolbar (mode, filters, show done, actions, zoom) and the editors (objective, milestone dates, task detail);
 * the diagram itself, with its graph, layout and gestures, is `flow-canvas`, and `flow-outline` is the same
 * graph as an indented list.
 */
@Component({
  selector: 'app-project-flow',
  standalone: true,
  imports: [TranslatePipe, FlowCanvasComponent, FlowOutlineComponent, ObjectiveModalComponent, MilestoneDatesModalComponent, TaskDetailModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-flow.component.html',
  styleUrl: './project-flow.component.css',
})
export class ProjectFlowComponent {
  readonly view = inject(ViewService);
  private readonly flow = inject(FlowService);
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly injector = inject(Injector);
  /** Absent while the Outline is showing. */
  protected readonly canvas = viewChild(FlowCanvasComponent);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly project = input.required<Project>();

  /** Not remembered: a phone opens in Outline, anything wider in the diagram, and the toolbar switches either way. */
  readonly mode = signal<FlowMode>(typeof matchMedia === 'function' && matchMedia(SMALL_SCREEN).matches ? 'outline' : 'diagram');
  readonly horizons = HORIZONS;
  readonly statuses = STATUSES;
  /** Empty = all, like the "All" chip says. */
  readonly horizonFilter = signal<ReadonlySet<Horizon>>(new Set());
  readonly statusFilter = signal<ReadonlySet<ObjectiveStatus>>(new Set());
  protected readonly emptyHorizons: ReadonlySet<Horizon> = new Set();
  protected readonly emptyStatuses: ReadonlySet<ObjectiveStatus> = new Set();

  readonly editor = signal<ObjectiveEditor | null>(null);
  readonly datesId = signal<string | null>(null);
  readonly detailId = signal<string | null>(null);
  readonly addingMilestone = signal(false);
  readonly milestoneName = signal('');

  protected readonly editedObjective = computed<Objective | null>(() => {
    const editor = this.editor();
    if (!editor?.id) return null;
    return (this.flow.objectivesByProject().get(this.project().id) ?? []).find((o) => o.id === editor.id) ?? null;
  });

  protected readonly datesMilestone = computed(() => {
    const id = this.datesId();
    return id ? (this.projects.milestones().find((m) => m.id === id) ?? null) : null;
  });

  protected readonly detailTodo = computed(() => {
    const id = this.detailId();
    return id ? (this.todos.todos().find((t) => t.id === id) ?? null) : null;
  });

  // ---- filters ---------------------------------------------------------------------------------------------

  toggleHorizon(horizon: Horizon): void {
    this.horizonFilter.update((set) => toggled(set, horizon));
  }

  toggleStatus(status: ObjectiveStatus): void {
    this.statusFilter.update((set) => toggled(set, status));
  }

  toggleShowDone(): void {
    this.view.showDoneTasks.update((on) => !on);
  }

  // ---- actions ---------------------------------------------------------------------------------------------

  newObjective(horizon: Horizon = 'short', y: number | null = null): void {
    this.editor.set({ id: null, horizon, y });
  }

  editObjective(id: string): void {
    const objective = (this.flow.objectivesByProject().get(this.project().id) ?? []).find((o) => o.id === id);
    if (objective) this.editor.set({ id, horizon: objective.horizon, y: null });
  }

  /** A new objective that a filter would hide clears that filter, so it does not seem to vanish. */
  onObjectiveCreated(objective: Objective): void {
    const editor = this.editor();
    if (editor?.y != null) this.flow.setPosition(this.project().id, `objective:${objective.id}`, cardX(objective.horizon), editor.y);
    if (this.horizonFilter().size && !this.horizonFilter().has(objective.horizon)) this.horizonFilter.set(new Set());
    if (this.statusFilter().size && !this.statusFilter().has(objective.status)) this.statusFilter.set(new Set());
  }

  startAddMilestone(): void {
    this.addingMilestone.set(true);
    this.milestoneName.set('');
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLInputElement>('.project-flow__milestone-input')?.focus(), {
      injector: this.injector,
    });
  }

  addMilestone(): void {
    const name = this.milestoneName().trim();
    if (!name) return;
    this.projects.addMilestone(this.project().id, name);
    this.cancelAddMilestone();
  }

  cancelAddMilestone(): void {
    this.addingMilestone.set(false);
    this.milestoneName.set('');
  }
}

function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}
