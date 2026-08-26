import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';

@Component({
  selector: 'app-completed-tasks-stack',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './completed-tasks-stack.component.html',
  styleUrl: './completed-tasks-stack.component.css',
})
export class CompletedTasksStackComponent {
  readonly todos = inject(TodosService);

  readonly open = signal(false);

  show(): void {
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }
}
