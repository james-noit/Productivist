import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { ProjectsService } from '../../../services/projects.service';
import { RecurrenceService } from '../../../services/recurrence.service';
import { ViewService, type ProjectsTab } from '../../../services/view.service';
import { ContextMenuComponent } from '../context-menu/context-menu.component';
import { IconComponent } from '../icon/icon.component';
import { MilestoneQuickFormComponent } from '../milestone-quick-form/milestone-quick-form.component';
import { ProjectsPageState } from '../projects-view/projects-page.state';

type Page = 'main' | 'milestone' | 'delete';

/**
 * The two context menus of Tasks and projects, inside `context-menu`. On a project (`projectId` set) the project's
 * actions plus creating things inside it, with a second page each for "New milestone…" and "Delete…"; anywhere else
 * the create menu (the floating "+" plus Plan my day and, on the Projects tab, the layout and the filters). The
 * page's `projects-view` decides where and when it opens; this component only knows what to offer. The shortcut
 * letters are hints (the floating button owns the keys).
 */
@Component({
  selector: 'app-projects-context-menu',
  standalone: true,
  imports: [TranslatePipe, ContextMenuComponent, IconComponent, MilestoneQuickFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-context-menu.component.html',
  styles: `
    :host {
      display: contents;
    }

    .pctx {
      display: contents;
    }

    .pctx__name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class ProjectsContextMenuComponent {
  private readonly projects = inject(ProjectsService);
  private readonly recurrences = inject(RecurrenceService);
  private readonly dailyPlan = inject(DailyPlanService);
  readonly view = inject(ViewService);
  readonly state = inject(ProjectsPageState);

  readonly x = input.required<number>();
  readonly y = input.required<number>();
  /** The project that was clicked; null = the create menu. */
  readonly projectId = input<string | null>(null);
  readonly tab = input<ProjectsTab>('projects');
  readonly returnFocus = input<HTMLElement | null>(null);
  readonly dismissed = output<void>();

  readonly page = signal<Page>('main');

  readonly project = computed(() => {
    const id = this.projectId();
    return id ? (this.projects.projects().find((p) => p.id === id) ?? null) : null;
  });
  /** This project's recurring series, paused included; the active ones are the count shown. */
  readonly series = computed(() => {
    const id = this.projectId();
    const all = id ? this.recurrences.recurrences().filter((r) => r.projectId === id) : [];
    return { total: all.length, active: all.reduce((n, r) => (r.paused ? n : n + 1), 0) };
  });
  readonly planInProgress = computed(() => this.dailyPlan.stage() !== 'prompt' || this.dailyPlan.hasAnyObjective());
  readonly planStep = computed(() => this.dailyPlan.stepIndex() + 1);
  readonly onProjectsTab = computed(() => this.tab() === 'projects');

  goTo(page: Page, menu: { focusFirst(): void }): void {
    this.page.set(page);
    menu.focusFirst();
  }

  /** Escape on a second page goes back to the first instead of closing the menu. */
  onPageEscape(event: Event, menu: { focusFirst(): void }): void {
    if (this.page() === 'main') return;
    event.stopPropagation();
    this.goTo('main', menu);
  }

  // Every action closes the menu without moving focus: a dialog it opens takes focus itself, and the dialog hands it
  // back to `returnFocus` (the menu item that was clicked is gone by then).

  open(id: string, menu: { close(): void }): void {
    menu.close();
    this.view.openProject(id);
  }

  newTaskIn(id: string, menu: { close(): void }): void {
    menu.close();
    this.state.openNewTask(this.returnFocus(), id);
  }

  addMilestone(projectId: string, name: string, menu: { close(): void }): void {
    menu.close();
    this.projects.addMilestone(projectId, name);
  }

  newRecurringIn(id: string, menu: { close(): void }): void {
    menu.close();
    this.view.openRecurring('new', { projectId: id });
  }

  recurringOf(id: string, menu: { close(): void }): void {
    menu.close();
    this.view.openRecurring(null, { projectId: id });
  }

  edit(id: string, menu: { close(): void }): void {
    menu.close();
    this.state.editProject(id);
  }

  remove(id: string, menu: { close(): void }): void {
    menu.close();
    this.projects.removeProject(id);
  }

  newTask(menu: { close(): void }): void {
    menu.close();
    this.state.openNewTask(this.returnFocus());
  }

  newProject(menu: { close(): void }): void {
    menu.close();
    this.state.openNewProject(this.returnFocus());
  }

  newRecurring(menu: { close(): void }): void {
    menu.close();
    this.view.openRecurring('new');
  }

  planMyDay(menu: { close(): void }): void {
    menu.close();
    this.view.openPlanning();
  }

  toggleLayout(menu: { close(): void }): void {
    menu.close();
    this.state.layout.set(this.state.activeLayout() === 'cards' ? 'list' : 'cards');
  }

  openFilters(menu: { close(): void }): void {
    menu.close();
    this.state.openFilters(this.returnFocus());
  }
}
