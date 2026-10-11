import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { cardX } from '../../../lib/flow-geometry';
import { trapTab } from '../../../lib/focus-trap';
import { lockScroll } from '../../../lib/scroll-lock';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import type { Horizon, Objective } from '../../../types/flow';
import type { Project } from '../../../types/project';
import { FabMenuComponent, type FabItem } from '../fab-menu/fab-menu.component';
import { FlowCanvasComponent } from '../flow-canvas/flow-canvas.component';
import { FlowFilterDrawerComponent } from '../flow-filter-drawer/flow-filter-drawer.component';
import { FlowOutlineComponent } from '../flow-outline/flow-outline.component';
import { MilestoneDatesModalComponent } from '../milestone-dates-modal/milestone-dates-modal.component';
import { NewTaskModalComponent } from '../new-task-modal/new-task-modal.component';
import { ObjectiveModalComponent } from '../objective-modal/objective-modal.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import { FlowViewState } from './flow-view-state';

/** How the Flow presentation shows its graph: the pannable diagram, or the same graph as an indented outline. */
type FlowMode = 'diagram' | 'outline';

/** Below this viewport width the view opens in Outline: a pannable diagram is awkward on a phone. */
const SMALL_SCREEN = '(max-width: 700px)';

/** The class the focus mode puts on <html>, so the floating support pill can get out of the way (style.css). */
const FOCUS_CLASS = 'flow-focus-mode';

/** The floating "+" menu: the three things Flow can create. */
const FAB_ITEMS: readonly FabItem[] = [
  { id: 'objective', icon: 'target', labelKey: 'flow.objective.newTitle', shortcut: 'O' },
  { id: 'milestone', icon: 'flag', labelKey: 'flow.newMilestone', shortcut: 'M' },
  { id: 'task', icon: 'check', labelKey: 'projects.fab.task', shortcut: 'N' },
];

/** The objective editor's state: the objective being edited (null = new), the horizon a new one starts in, and its drop height. */
interface ObjectiveEditor {
  id: string | null;
  horizon: Horizon;
  y: number | null;
}

interface FilterChip {
  id: string;
  labelKey: string;
  /** Translation key of the horizon the label names, if any. */
  nameKey?: string;
}

/**
 * The Flow presentation of a project: where its work flows into its objectives. One top bar (Diagram | Outline,
 * Filters, Focus mode) is all that is left of the old two toolbars: what the diagram needs (zoom, fit, tidy up) is
 * in the canvas, creation is the floating "+", actions on an item are in the selection toolbar, and horizon
 * visibility is in the lane headers and the filters drawer. This component owns the mode, the focus mode (the
 * presentation fixed over the whole app), the editors (objective, milestone, new task, milestone dates, task
 * detail) and provides `FlowViewState`; the diagram is `flow-canvas`, and `flow-outline` is the same graph as an
 * indented list.
 */
@Component({
  selector: 'app-project-flow',
  standalone: true,
  imports: [
    TranslatePipe,
    FlowCanvasComponent,
    FlowOutlineComponent,
    FlowFilterDrawerComponent,
    FabMenuComponent,
    ObjectiveModalComponent,
    MilestoneDatesModalComponent,
    NewTaskModalComponent,
    TaskDetailModalComponent,
    UiIconComponent,
  ],
  providers: [FlowViewState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-flow.component.html',
  styleUrl: './project-flow.component.css',
})
export class ProjectFlowComponent {
  protected readonly state = inject(FlowViewState);
  private readonly flow = inject(FlowService);
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly injector = inject(Injector);
  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  private readonly milestonePanel = viewChild<ElementRef<HTMLElement>>('milestonePanel');
  private readonly milestoneInput = viewChild<ElementRef<HTMLInputElement>>('milestoneInput');

  readonly project = input.required<Project>();

  /** Not remembered: a phone opens in Outline, anything wider in the diagram, and the top bar switches either way. */
  readonly mode = signal<FlowMode>(typeof matchMedia === 'function' && matchMedia(SMALL_SCREEN).matches ? 'outline' : 'diagram');
  /** The presentation fixed over the whole app. Not remembered. */
  readonly focus = signal(false);

  readonly editor = signal<ObjectiveEditor | null>(null);
  readonly datesId = signal<string | null>(null);
  readonly detailId = signal<string | null>(null);
  readonly addingMilestone = signal(false);
  readonly milestoneName = signal('');
  readonly creatingTask = signal(false);

  protected readonly fabItems = FAB_ITEMS;

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

  /** The filters that differ from the defaults, as removable chips under the top bar. */
  protected readonly chips = computed<FilterChip[]>(() => {
    const chips: FilterChip[] = this.state.hiddenList().map((h) => ({ id: `horizon:${h}`, labelKey: 'flow.chips.horizonHidden', nameKey: `flow.horizons.${h}` }));
    if (this.state.showAchieved() === false) chips.push({ id: 'achieved', labelKey: 'flow.chips.achievedHidden' });
    if (this.state.showDropped() === true) chips.push({ id: 'dropped', labelKey: 'flow.chips.droppedShown' });
    if (this.state.showDone()) chips.push({ id: 'done', labelKey: 'flow.chips.doneShown' });
    return chips;
  });

  /** Where focus goes back to after a creation dialog opened from the floating button closes. */
  private opener: HTMLElement | null = null;
  private releaseScroll: (() => void) | null = null;

  constructor() {
    this.state.bind(() => this.project().id);

    // The focus mode covers the app: the page behind must not scroll and the floating support pill steps aside.
    effect(() => {
      const on = this.focus();
      untracked(() => this.applyFocus(on));
    });
    inject(DestroyRef).onDestroy(() => this.applyFocus(false));
  }

  private applyFocus(on: boolean): void {
    document.documentElement.classList.toggle(FOCUS_CLASS, on);
    if (on && !this.releaseScroll) this.releaseScroll = lockScroll();
    else if (!on && this.releaseScroll) {
      this.releaseScroll();
      this.releaseScroll = null;
    }
  }

  toggleFocus(): void {
    this.focus.update((on) => !on);
  }

  // ---- filters ---------------------------------------------------------------------------------------------

  protected removeChip(chip: FilterChip): void {
    if (chip.id.startsWith('horizon:')) this.state.setHorizonHidden(chip.id.slice('horizon:'.length) as Horizon, false);
    else if (chip.id === 'achieved') this.state.showAchieved.set(true);
    else if (chip.id === 'dropped') this.state.showDropped.set(false);
    else this.state.showDone.set(false);
  }

  // ---- creating --------------------------------------------------------------------------------------------

  protected onFabPick(id: string): void {
    this.opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    if (id === 'objective') this.newObjective();
    else if (id === 'milestone') this.startAddMilestone();
    else this.creatingTask.set(true);
  }

  private restoreFocus(): void {
    const opener = this.opener;
    this.opener = null;
    queueMicrotask(() => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
  }

  newObjective(horizon: Horizon = 'short', y: number | null = null): void {
    this.editor.set({ id: null, horizon, y });
  }

  editObjective(id: string): void {
    const objective = (this.flow.objectivesByProject().get(this.project().id) ?? []).find((o) => o.id === id);
    if (objective) this.editor.set({ id, horizon: objective.horizon, y: null });
  }

  /** A new objective that a filter would hide switches that filter off, so it does not seem to vanish. */
  onObjectiveCreated(objective: Objective): void {
    const editor = this.editor();
    if (editor?.y != null) this.flow.setPosition(this.project().id, `objective:${objective.id}`, cardX(objective.horizon), editor.y);
    this.state.reveal(objective);
  }

  closeObjectiveEditor(): void {
    this.editor.set(null);
    this.restoreFocus();
  }

  closeNewTask(): void {
    this.creatingTask.set(false);
    this.restoreFocus();
  }

  startAddMilestone(): void {
    this.milestoneName.set('');
    this.addingMilestone.set(true);
    afterNextRender(() => this.milestoneInput()?.nativeElement.focus(), { injector: this.injector });
  }

  createMilestone(): void {
    const name = this.milestoneName().trim();
    if (!name) return;
    this.projects.addMilestone(this.project().id, name);
    this.closeMilestone();
  }

  closeMilestone(): void {
    this.addingMilestone.set(false);
    this.milestoneName.set('');
    this.restoreFocus();
  }

  protected onMilestoneKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeMilestone();
      return;
    }
    const panel = this.milestonePanel()?.nativeElement;
    if (panel) trapTab(event, panel);
  }

  protected closeMilestoneOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeMilestone();
  }

  // ---- keyboard --------------------------------------------------------------------------------------------

  /** Another dialog (a modal, the filters drawer, a dialog of the app) is open on top of the presentation. */
  private otherModalOpen(): boolean {
    const surface = this.surface().nativeElement;
    return Array.from(document.querySelectorAll('[aria-modal="true"]')).some((el) => el !== surface);
  }

  /** Tab stays inside the presentation while it is the focus mode (a nested dialog keeps its own trap). */
  protected onSurfaceKeydown(event: KeyboardEvent): void {
    if (!this.focus() || event.defaultPrevented) return;
    const surface = this.surface().nativeElement;
    if ((event.target as Element).closest('[aria-modal="true"]') === surface) trapTab(event, surface);
  }

  /**
   * F toggles the focus mode (not while typing or with a dialog open); Escape leaves it, but only once nothing
   * inside has used the key (a question, a menu, the selection, a dialog), and without the project view also
   * leaving: the surface is `aria-modal` while focused, which that view's own Escape handling respects.
   */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select, [role="textbox"]'));
    if (event.key === 'Escape') {
      if (!this.focus() || typing || this.otherModalOpen()) return;
      event.preventDefault();
      this.focus.set(false);
    } else if ((event.key === 'f' || event.key === 'F') && !event.shiftKey) {
      if (typing || this.otherModalOpen() || (target instanceof HTMLElement && target.closest('[data-menu]'))) return;
      event.preventDefault();
      this.toggleFocus();
    }
  }
}
