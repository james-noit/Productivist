import { Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import type { Priority } from '../../../types/todo';

let nextId = 0;

@Component({
  selector: 'app-todo-form',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './todo-form.component.html',
  styleUrl: './todo-form.component.css',
})
export class TodoFormComponent {
  readonly todos = inject(TodosService);

  readonly projectId = input<string | undefined>();
  readonly milestoneId = input<string | undefined>();

  readonly tagSuggestionsId = `todo-form-tags-${nextId++}`;

  readonly title = signal('');
  readonly description = signal('');
  readonly importance = signal<Priority>('medium');
  readonly urgency = signal<Priority>('medium');
  readonly tagsInput = signal('');
  readonly pomodorosForTermination = signal('');
  readonly expanded = signal(false);

  private readonly formEl = viewChild<ElementRef<HTMLFormElement>>('formEl');
  private readonly titleInputEl = viewChild<ElementRef<HTMLInputElement>>('titleInputEl');

  submit(): void {
    const trimmed = this.title().trim();
    if (!trimmed) return;
    const tags = this.tagsInput()
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const pomodoros = parseInt(this.pomodorosForTermination(), 10);
    this.todos.addTodo({
      title: trimmed,
      description: this.description().trim() || undefined,
      importance: this.importance(),
      urgency: this.urgency(),
      tags,
      projectId: this.projectId(),
      milestoneId: this.milestoneId(),
      pomodorosForTermination: Number.isFinite(pomodoros) && pomodoros > 0 ? pomodoros : undefined,
    });
    this.title.set('');
    this.description.set('');
    this.tagsInput.set('');
    this.pomodorosForTermination.set('');
    this.expanded.set(false);
    queueMicrotask(() => this.titleInputEl()?.nativeElement.focus());
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    const form = this.formEl()?.nativeElement;
    if (form && next && form.contains(next)) return;
    this.expanded.set(false);
  }
}
