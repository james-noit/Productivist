import { Component, ElementRef, HostListener, computed, inject, isDevMode, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { SettingsService } from '../../../services/settings.service';
import { MultitaskService } from '../../../services/multitask.service';
import { ViewService, type AppView } from '../../../services/view.service';
import { ProjectsService } from '../../../services/projects.service';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

const RESET_PHRASE = 'confirm reset';

@Component({
  selector: 'app-app-menu',
  standalone: true,
  imports: [FormsModule, TranslatePipe, LanguageSelectorComponent, ThemeToggleComponent],
  templateUrl: './app-menu.component.html',
  styleUrl: './app-menu.component.css',
})
export class AppMenuComponent {
  private readonly todos = inject(TodosService);
  private readonly settings = inject(SettingsService);
  private readonly multitask = inject(MultitaskService);
  readonly view = inject(ViewService);
  private readonly projects = inject(ProjectsService);
  private readonly dailyPlan = inject(DailyPlanService);

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

  goToView(next: AppView): void {
    this.view.setView(next);
    this.close();
  }

  exportTodo(): void {
    const data = {
      version: 2,
      todos: this.todos.todos(),
      projects: this.projects.projects(),
      milestones: this.projects.milestones(),
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
      this.todos.importTodos({ version: 1, todos: parsed.todos ?? [] });
      this.projects.importProjects({ projects: parsed.projects ?? [], milestones: parsed.milestones ?? [] });
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

  confirmReset(): void {
    if (!this.resetConfirmValid()) return;
    this.todos.reset();
    this.settings.reset();
    this.multitask.reset();
    this.view.reset();
    this.projects.reset();
    this.dailyPlan.reset();
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
