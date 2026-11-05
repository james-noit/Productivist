import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { diffDays, formatIso, todayIso } from '../../../lib/dates';
import { trapTab } from '../../../lib/focus-trap';
import { DueUrgencyService } from '../../../services/due-urgency.service';
import { ProjectsService } from '../../../services/projects.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { Priority } from '../../../types/todo';

interface DueRow {
  id: string;
  title: string;
  /** Project name; null = Inbox. */
  project: string | null;
  /** 'overdue' | 'today' | 'tomorrow' | 'inDays' key of `dueUrgency.*`, plus the day count for the last. */
  dueKey: string;
  days: number;
  dateText: string;
  overdue: boolean;
  urgency: Priority;
}

/**
 * "Due soon": the tasks `DueUrgencyService` found after a sync, each with Make urgent / Edit… / Skip. Lazy, rendered by
 * AppComponent while `pendingIds` is not empty. Closing it (Escape, x, backdrop, Not now) skips what is left.
 */
@Component({
  selector: 'app-due-urgency-modal',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent, TaskDetailModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './due-urgency-modal.component.html',
  styleUrl: './due-urgency-modal.component.css',
})
export class DueUrgencyModalComponent {
  private readonly service = inject(DueUrgencyService);
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly settings = inject(SettingsService);

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  readonly uid = `due-urgency-${Math.random().toString(36).slice(2, 8)}`;
  readonly detailId = signal<string | null>(null);
  private pressedOnBackdrop = false;
  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  readonly days = this.settings.urgencyPromptDays;

  private readonly formatter = computed(() => new Intl.DateTimeFormat(this.settings.language(), { weekday: 'short', day: 'numeric', month: 'short' }));

  readonly rows = computed<DueRow[]>(() => {
    const ids = this.service.pendingIds();
    const byId = new Map(this.todos.todos().map((t) => [t.id, t]));
    const names = new Map(this.projects.projects().map((p) => [p.id, p.name]));
    const formatter = this.formatter();
    const today = todayIso();
    const rows: DueRow[] = [];
    for (const id of ids) {
      const t = byId.get(id);
      if (!t?.dueDate) continue;
      const days = diffDays(today, t.dueDate);
      rows.push({
        id,
        title: t.title,
        project: t.projectId ? (names.get(t.projectId) ?? null) : null,
        dueKey: days < 0 ? 'overdue' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'inDays',
        days,
        dateText: formatIso(formatter, t.dueDate),
        overdue: days < 0,
        urgency: t.urgency,
      });
    }
    return rows;
  });

  readonly detail = computed(() => {
    const id = this.detailId();
    return id ? (this.todos.todos().find((t) => t.id === id) ?? null) : null;
  });

  constructor() {
    afterNextRender(() => (this.panel().nativeElement.querySelector<HTMLElement>('[data-first]') ?? this.panel().nativeElement).focus({ preventScroll: true }));
    inject(DestroyRef).onDestroy(() => {
      if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    });
  }

  makeUrgent(id: string): void {
    this.service.makeUrgent([id]);
  }

  makeAll(): void {
    this.service.makeUrgent(this.service.pendingIds());
  }

  skip(id: string): void {
    this.service.dismiss([id]);
  }

  close(): void {
    this.service.close();
  }

  /** Task Details closed: the user reviewed the task, so it is not asked again. */
  detailClosed(id: string): void {
    this.detailId.set(null);
    this.service.dismiss([id]);
  }

  onBackdropDown(event: MouseEvent): void {
    this.pressedOnBackdrop = event.target === event.currentTarget;
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.pressedOnBackdrop && event.target === event.currentTarget) this.close();
    this.pressedOnBackdrop = false;
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.detailId()) return; // Task Details above handles its own keys
    if (event.key === 'Escape') {
      // Swallowed: the project view would otherwise treat it as "leave the project".
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else {
      trapTab(event, this.panel().nativeElement);
    }
  }
}
