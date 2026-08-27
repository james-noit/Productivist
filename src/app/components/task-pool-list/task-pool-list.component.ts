import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { TaskProjectTagComponent } from '../task-project-tag/task-project-tag.component';
import { TaskBadgesComponent } from '../task-badges/task-badges.component';
import type { Todo } from '../../../types/todo';

@Component({
  selector: 'app-task-pool-list',
  standalone: true,
  imports: [FormsModule, TranslatePipe, TaskProjectTagComponent, TaskBadgesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-pool-list.component.html',
  styleUrl: './task-pool-list.component.css',
})
export class TaskPoolListComponent {
  readonly todos = inject(TodosService);

  readonly tasks = input.required<Todo[]>();
  readonly isPickable = input<(id: string) => boolean>(() => true);
  readonly hideUnpickable = input(true);
  readonly unpickableStatus = input<string>('');
  readonly rowsDraggable = input(true);

  readonly pick = output<string>();

  readonly searchQuery = signal('');
  private readonly searchInputEl = viewChild<ElementRef<HTMLInputElement>>('searchInputEl');

  focusSearch(): void {
    this.searchInputEl()?.nativeElement.focus();
  }

  readonly displayedTasks = computed(() => {
    const base = this.hideUnpickable() ? this.tasks().filter((t) => this.isPickable()(t.id)) : this.tasks();
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return base;
    return base.filter((t) => t.title.toLowerCase().includes(q));
  });
}
