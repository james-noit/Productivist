import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { buildPageStats } from '../../../lib/project-cards';
import { trapTab } from '../../../lib/focus-trap';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { RecurrenceService } from '../../../services/recurrence.service';
import { TodosService } from '../../../services/todos.service';
import { ProjectActivityService } from '../../../services/project-activity.service';
import { ViewService, type ProjectsTab } from '../../../services/view.service';
import { EisenhowerViewComponent } from '../eisenhower-view/eisenhower-view.component';
import { FabMenuComponent, type FabItem } from '../fab-menu/fab-menu.component';
import { NewTaskModalComponent } from '../new-task-modal/new-task-modal.component';
import { ProjectFormComponent } from '../project-form/project-form.component';
import { ProjectsContextMenuComponent } from '../projects-context-menu/projects-context-menu.component';
import { ProjectsDashboardComponent } from '../projects-dashboard/projects-dashboard.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import { ProjectsPageState } from './projects-page.state';

const TABS: readonly ProjectsTab[] = ['projects', 'matrix'];

/** A press this long (ms) on touch, without moving more than `LONG_PRESS_SLOP` px, opens the context menu. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

/** Where the native menu is left alone: text fields, links, and anything inside a dialog, drawer or ⋯ menu. */
const NATIVE_MENU_TARGETS = 'input, textarea, select, a[href], [contenteditable=""], [contenteditable="true"], [aria-modal="true"], [role="dialog"], .kebab__panel';

/** One open context menu. `id` is new each time, so a menu opened over another is a fresh component. */
interface ContextMenuRequest {
  id: number;
  x: number;
  y: number;
  /** The project that was clicked; null = the create menu. */
  projectId: string | null;
  /** Where focus goes back to when Escape or Tab closes the menu. */
  returnFocus: HTMLElement | null;
}

/** The floating "+" menu: New task (N), New project (P) and New recurring task. */
const FAB_ITEMS: readonly FabItem[] = [
  { id: 'task', icon: 'check', labelKey: 'projects.fab.task', shortcut: 'N' },
  { id: 'project', icon: 'folder', labelKey: 'projects.fab.project', shortcut: 'P' },
  { id: 'recurring', icon: 'repeat', labelKey: 'projects.fab.recurring' },
];

/**
 * Tasks and projects: the page header (title, one-line summary, Recurring and Plan my day), the Projects | Eisenhower Matrix
 * tabs, the tab bodies, the floating "+" and the dialogs it opens (New task, New project), so both tabs can create.
 * The summary and the dashboard share one `stats` computed (a single pass over the todos). `ProjectsPageState`
 * (search, filters, sort, layout, create requests) is provided here, for the dashboard, the filters drawer and
 * the floating button to share without a root service. It also owns the page's context menu: right-click, long-press
 * (touch) and the Menu key / Shift+F10 open `projects-context-menu` (lazy) at the pointer or at the focused card, on a
 * project (`data-project-id` on the card or row) or anywhere else on either tab. The browser's own menu is left
 * alone with Shift held, over text fields, links or selected text, and inside dialogs, drawers and ⋯ menus.
 */
@Component({
  selector: 'app-projects-view',
  standalone: true,
  // EisenhowerViewComponent is only used inside a @defer block, so it gets its own chunk.
  imports: [
    TranslatePipe,
    ProjectsDashboardComponent,
    EisenhowerViewComponent,
    FabMenuComponent,
    NewTaskModalComponent,
    ProjectFormComponent,
    ProjectsContextMenuComponent,
    UiIconComponent,
  ],
  providers: [ProjectsPageState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-view.component.html',
  styleUrl: './projects-view.component.css',
})
export class ProjectsViewComponent {
  readonly view = inject(ViewService);
  readonly state = inject(ProjectsPageState);
  private readonly injector = inject(Injector);
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly flow = inject(FlowService);
  private readonly recurrences = inject(RecurrenceService);
  private readonly activity = inject(ProjectActivityService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly activeRecurring = this.recurrences.activeCount;
  protected readonly fabItems = FAB_ITEMS;

  /** True once the wizard holds anything worth coming back to, so the button reads "Resume". */
  readonly planInProgress = computed(() => this.dailyPlan.stage() !== 'prompt' || this.dailyPlan.hasAnyObjective());
  readonly planStep = computed(() => this.dailyPlan.stepIndex() + 1);

  /** Everything the page shows about the tasks, built in one pass; the dashboard receives it as an input. */
  readonly stats = computed(() =>
    buildPageStats(
      this.todos.todos(),
      this.projects.sortedProjects(),
      this.projects.milestones(),
      this.flow.objectivesByProject(),
      this.recurrences.today(),
      (list) => this.todos.sortTasks(list),
      this.activity.activity(),
    ),
  );
  readonly projectCount = computed(() => this.projects.projects().length);

  private readonly newProjectPanel = viewChild<ElementRef<HTMLElement>>('newProjectPanel');

  /** The open context menu (one at a time) and the list the template loops over, so a new request re-creates it. */
  readonly contextMenu = signal<ContextMenuRequest | null>(null);
  protected readonly contextMenus = computed(() => {
    const menu = this.contextMenu();
    return menu ? [menu] : [];
  });
  private menuSeq = 0;
  private press: { x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
  /** A long-press opened the menu: the click that follows the finger lifting must not also open the card. */
  private swallowClick = false;
  private touchMenuAt = 0;
  private keyMenuAt = 0;

  constructor() {
    const host = this.host.nativeElement;
    const swallow = (event: Event): void => {
      if (!this.swallowClick) return;
      this.swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    host.addEventListener('click', swallow, true);
    inject(DestroyRef).onDestroy(() => {
      host.removeEventListener('click', swallow, true);
      this.cancelPress();
    });

    // The name field takes focus once the New project dialog has rendered.
    effect(() => {
      if (this.state.creatingProject()) {
        afterNextRender(() => this.newProjectPanel()?.nativeElement.querySelector<HTMLElement>('input[name="name"]')?.focus(), { injector: this.injector });
      }
    });
  }

  /** The floating button asked for something to be created; the focused control (the button, or whatever had focus for a shortcut) gets focus back afterwards. */
  onFabPick(id: string): void {
    if (id === 'task') this.state.openNewTask();
    else if (id === 'project') this.state.openNewProject();
    else this.view.openRecurring('new');
  }

  closeNewTask(): void {
    this.state.creatingTask.set(false);
    this.state.newTaskProjectId.set(null);
    this.state.restoreFocus();
  }

  closeNewProject(): void {
    this.state.creatingProject.set(false);
    this.state.restoreFocus();
  }

  createProject(data: { icon: string; name: string; description: string; notes: string }): void {
    this.projects.addProject(data);
    this.closeNewProject();
  }

  onNewProjectKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeNewProject();
      return;
    }
    const panel = this.newProjectPanel()?.nativeElement;
    if (panel) trapTab(event, panel);
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeNewProject();
  }

  selectTab(tab: ProjectsTab): void {
    this.view.openProjectsTab(tab);
  }

  /** Left/Right move between the two tabs, wrapping, and take focus with them. */
  onTabKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(this.view.projectsTab()) + step + TABS.length) % TABS.length];
    this.selectTab(next);
    const tablist = event.currentTarget as HTMLElement;
    queueMicrotask(() => tablist.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus());
  }

  // Context menu ------------------------------------------------------------------------------------------------

  /** Right-click. Shift, text fields, links, selected text and dialogs keep the browser's own menu. */
  onContextMenu(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.ctxmenu')) {
      event.preventDefault();
      return;
    }
    // The Menu key fires a contextmenu event of its own on some platforms (button 0): the keydown already opened the menu.
    if (event.button === 0 && !event.ctrlKey && performance.now() - this.keyMenuAt < 1000) {
      event.preventDefault();
      return;
    }
    // Android Chrome fires contextmenu on a long-press too, just before or after our own timer.
    if (this.contextMenu() && performance.now() - this.touchMenuAt < 800) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey || target.closest(NATIVE_MENU_TARGETS) || this.selectionAt(event.clientX, event.clientY)) return;
    event.preventDefault();
    if (this.press) {
      this.swallowClick = true;
      this.touchMenuAt = performance.now();
    }
    this.cancelPress();
    this.openMenu(event.clientX, event.clientY, target);
  }

  /** The Menu key or Shift+F10 opens the menu at the bottom-left of the focused card, row or control. */
  onPageKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest('.ctxmenu') || target.closest(NATIVE_MENU_TARGETS)) return;
    event.preventDefault();
    this.keyMenuAt = performance.now();
    const anchor = target.closest('[data-project-id]') ?? target;
    const rect = anchor.getBoundingClientRect();
    this.openMenu(rect.left, rect.bottom, target, target);
  }

  onPagePointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('.ctxmenu') || target.closest(NATIVE_MENU_TARGETS)) return;
    this.cancelPress();
    const { clientX: x, clientY: y } = event;
    const timer = setTimeout(() => {
      this.press = null;
      this.swallowClick = true;
      this.touchMenuAt = performance.now();
      this.openMenu(x, y, target);
    }, LONG_PRESS_MS);
    this.press = { x, y, timer };
  }

  onPagePointerMove(event: PointerEvent): void {
    const press = this.press;
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP) this.cancelPress();
  }

  onPagePointerEnd(): void {
    this.cancelPress();
    // The click of a long-press arrives right after the finger lifts; do not let the flag outlive it.
    if (this.swallowClick) setTimeout(() => (this.swallowClick = false), 350);
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  private cancelPress(): void {
    if (this.press) clearTimeout(this.press.timer);
    this.press = null;
  }

  private openMenu(x: number, y: number, target: Element, focused: HTMLElement | null = null): void {
    const card = target.closest<HTMLElement>('[data-project-id]');
    const active = document.activeElement;
    const returnFocus =
      focused ?? (card ? card.querySelector<HTMLElement>('h3 button') : active instanceof HTMLElement && active !== document.body ? active : null);
    this.contextMenu.set({ id: ++this.menuSeq, x, y, projectId: card?.dataset['projectId'] ?? null, returnFocus });
    // Once the menu has been found, the tip that points at it has done its job.
    this.state.contextMenuTipDismissed.set(true);
  }

  /** Whether the click lands on selected text, where the browser's own menu (Copy…) is the useful one. */
  private selectionAt(x: number, y: number): boolean {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) return false;
    for (const rect of Array.from(selection.getRangeAt(0).getClientRects())) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true;
    }
    return false;
  }
}
