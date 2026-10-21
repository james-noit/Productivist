import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, Injector, isDevMode, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { SettingsService } from '../../../services/settings.service';
import { MultitaskService } from '../../../services/multitask.service';
import { ViewService, type AppView } from '../../../services/view.service';
import { ProjectsService } from '../../../services/projects.service';
import { AccountService } from '../../../services/account.service';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { FlowService } from '../../../services/flow.service';
import { RecurrenceService } from '../../../services/recurrence.service';
import { SportDataService } from '../../../services/sport-data.service';
import { SportaskSettingsService } from '../../../services/sportask-settings.service';
import { SportaskService } from '../../../services/sportask.service';

const RESET_PHRASE = 'confirm reset';

@Component({
  selector: 'app-app-menu',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-menu.component.html',
  styleUrl: './app-menu.component.css',
})
export class AppMenuComponent {
  private readonly todos = inject(TodosService);
  private readonly settings = inject(SettingsService);
  private readonly multitask = inject(MultitaskService);
  readonly view = inject(ViewService);
  readonly accounts = inject(AccountService);
  private readonly projects = inject(ProjectsService);
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly flow = inject(FlowService);
  private readonly recurrences = inject(RecurrenceService);
  private readonly sportData = inject(SportDataService);
  private readonly sportaskSettings = inject(SportaskSettingsService);
  private readonly sportask = inject(SportaskService);
  private readonly injector = inject(Injector);

  readonly resetPhrase = RESET_PHRASE;
  readonly isDev = isDevMode();

  readonly open = signal(false);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly resetModalOpen = signal(false);
  readonly resetConfirmText = signal('');
  readonly resetConfirmValid = computed(() => this.resetConfirmText().trim().toLowerCase() === RESET_PHRASE);

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  /** The views every user has (Admin is added by the template while the account is the admin's). */
  readonly viewEntries: readonly { id: AppView; label: string }[] = [
    { id: 'projects', label: 'menu.projects' },
    { id: 'pomodoro', label: 'menu.pomodoro' },
    { id: 'sportask', label: 'config.sportask' },
  ];

  isActive(id: AppView): boolean {
    const current = this.view.current();
    return current === id || (id === 'projects' && current === 'project');
  }

  goToView(next: AppView): void {
    this.view.setView(next);
    this.close();
  }

  openConfiguration(): void {
    this.view.openConfiguration();
    this.close();
  }

  exportTodo(): void {
    const data = {
      // 3 added optional startDate/dueDate on todos and milestones; 4 added objectives, flowLinks and
      // flowLayouts; 5 added recurrences (and Todo.recurrenceId); 6 added sportBlocks and sportTemplates. 2 to 6
      // import the same way (missing arrays are empty). Rows imported from a Git forge carry an optional `source` (no version bump: old importers
      // ignore it; new ones validate it); the access tokens are never exported.
      version: 6,
      todos: this.todos.todos(),
      projects: this.projects.projects(),
      milestones: this.projects.milestones(),
      ...this.flow.exportFlow(),
      ...this.recurrences.exportRecurrences(),
      ...this.sportData.exportSport(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'todo.productivist.json';
    link.click();
    URL.revokeObjectURL(url);
    this.close();
  }

  importTodo(): void {
    this.fileInput()?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.close();
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.version === 'number' && parsed.version > 6) throw new Error('Unsupported export version');
      // Rows imported from a Git forge carry a `source` that must be well formed (the backend rejects bad ones); the
      // validation is a lazy chunk, which an import file is the only thing to need.
      const { sanitizeSources } = await import('../../../lib/forge-sanitize');
      this.todos.importTodos({ version: 1, todos: sanitizeSources(parsed.todos ?? []) });
      this.projects.importProjects({ projects: sanitizeSources(parsed.projects ?? []), milestones: sanitizeSources(parsed.milestones ?? []) });
      this.flow.importFlow(parsed);
      this.recurrences.importRecurrences(parsed);
      await this.sportData.importSport(parsed);
      // Drops links to tasks and milestones the file does not contain.
      this.projects.sweepFlow();
      // Creates what the imported series are due for (the sweep above also drops dangling project refs).
      this.recurrences.materialize();
    } catch (error) {
      console.error('Failed to import to-do file', error);
    }
  }

  openResetModal(): void {
    this.close();
    this.resetConfirmText.set('');
    this.resetModalOpen.set(true);
  }

  cancelReset(): void {
    this.resetModalOpen.set(false);
    this.resetConfirmText.set('');
  }

  cancelResetOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancelReset();
  }

  confirmReset(): void {
    if (!this.resetConfirmValid()) return;
    this.todos.reset();
    this.settings.reset();
    this.multitask.reset();
    this.view.reset();
    this.projects.reset();
    this.flow.reset();
    this.recurrences.reset();
    this.dailyPlan.reset();
    this.sportData.reset();
    this.sportaskSettings.reset();
    this.sportask.stop();
    this.sportask.armed.set(null);
    // Git access tokens are device-local and never exported, so only a full Reset removes them. The service is lazy
    // (it must stay out of the initial bundle), hence the dynamic import.
    void import('../../../services/forge-connections.service').then((m) => this.injector.get(m.ForgeConnectionsService).reset());
    this.resetModalOpen.set(false);
    this.resetConfirmText.set('');
  }

  async seedMockData(): Promise<void> {
    this.close();
    if (!this.isDev) return;
    const { seedMockData: seed } = await import('../../../dev/mockData');
    seed(this.todos, this.projects);
  }
}
