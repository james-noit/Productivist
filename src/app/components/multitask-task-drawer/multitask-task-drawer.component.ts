import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { MultitaskService } from '../../../services/multitask.service';
import { TodoFormComponent } from '../todo-form/todo-form.component';
import { TodoFiltersComponent } from '../todo-filters/todo-filters.component';
import { CompletedTasksStackComponent } from '../completed-tasks-stack/completed-tasks-stack.component';
import { ProjectsPanelComponent } from '../projects-panel/projects-panel.component';
import { TaskProjectTagComponent } from '../task-project-tag/task-project-tag.component';
import { TaskBadgesComponent } from '../task-badges/task-badges.component';

@Component({
  selector: 'app-multitask-task-drawer',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    TodoFormComponent,
    TodoFiltersComponent,
    CompletedTasksStackComponent,
    ProjectsPanelComponent,
    TaskProjectTagComponent,
  
    TaskBadgesComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './multitask-task-drawer.component.html',
  styleUrl: './multitask-task-drawer.component.css',
})
export class MultitaskTaskDrawerComponent {
  readonly todos = inject(TodosService);
  readonly multitask = inject(MultitaskService);

  readonly open = signal(false);
  readonly searchQuery = signal('');
  private readonly searchInputEl = viewChild<ElementRef<HTMLInputElement>>('searchInputEl');

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
    this.searchQuery.set('');
  }

  assignToNewCard(taskId: string): void {
    this.multitask.addCard(taskId);
  }

  readonly displayedTodos = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.todos.filteredTodos();
    return this.todos.filteredTodos().filter((todo) => todo.title.toLowerCase().includes(q));
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        queueMicrotask(() => this.searchInputEl()?.nativeElement.focus());
      }
    });
  }
}
