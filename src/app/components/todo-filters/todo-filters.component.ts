import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import type { Priority } from '../../../types/todo';

@Component({
  selector: 'app-todo-filters',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todo-filters.component.html',
  styleUrl: './todo-filters.component.css',
})
export class TodoFiltersComponent {
  readonly todos = inject(TodosService);
  private readonly translate = inject(TranslateService);

  readonly open = signal(false);

  get filterLabel(): string {
    return this.translate.instant('todo.filterToDos');
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  onImportance(event: Event): void {
    this.todos.setFilters({ importance: (event.target as HTMLSelectElement).value as Priority | 'all' });
  }

  onUrgency(event: Event): void {
    this.todos.setFilters({ urgency: (event.target as HTMLSelectElement).value as Priority | 'all' });
  }

  onTag(event: Event): void {
    this.todos.setFilters({ tag: (event.target as HTMLSelectElement).value });
  }
}
