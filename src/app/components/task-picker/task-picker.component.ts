import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { ProjectsPanelComponent } from '../projects-panel/projects-panel.component';
import { TaskProjectTagComponent } from '../task-project-tag/task-project-tag.component';
import type { Priority } from '../../../types/todo';

@Component({
  selector: 'app-task-picker',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ProjectsPanelComponent, TaskProjectTagComponent],
  templateUrl: './task-picker.component.html',
  styleUrl: './task-picker.component.css',
})
export class TaskPickerComponent {
  readonly todos = inject(TodosService);

  readonly isPickable = input<(todoId: string) => boolean>(() => true);

  readonly select = output<string>();
  readonly close = output<void>();

  readonly tab = signal<'all' | 'projects'>('all');
  readonly importance = signal<Priority | 'all'>('all');
  readonly urgency = signal<Priority | 'all'>('all');
  readonly tag = signal<string>('all');

  readonly pickableTasks = computed(() =>
    this.todos.sortTasks(
      this.todos
        .todos()
        .filter((todo) => !todo.done && this.isPickable()(todo.id))
        .filter((todo) => this.importance() === 'all' || todo.importance === this.importance())
        .filter((todo) => this.urgency() === 'all' || todo.urgency === this.urgency())
        .filter((todo) => this.tag() === 'all' || todo.tags.includes(this.tag())),
    ),
  );

  readonly onPickTask = (todoId: string): void => this.select.emit(todoId);
}
