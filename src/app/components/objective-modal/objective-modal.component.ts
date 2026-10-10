import { ChangeDetectionStrategy, Component, ElementRef, HostListener, type OnInit, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { isIsoDate } from '../../../lib/dates';
import { HORIZONS } from '../../../lib/flow-rules';
import { FlowService } from '../../../services/flow.service';
import type { Horizon, Objective, ObjectiveStatus } from '../../../types/flow';

const STATUSES: readonly ObjectiveStatus[] = ['active', 'achieved', 'dropped'];

/**
 * Creates or edits an objective of a project (title, description, horizon, status, target date) and, when
 * editing, deletes it after a confirmation. Deleting removes the objective's links too (the store does);
 * the tasks and milestones that fed it are untouched. Created per use, like the other editors.
 */
@Component({
  selector: 'app-objective-modal',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-modal.component.html',
  styleUrl: './objective-modal.component.css',
})
export class ObjectiveModalComponent implements OnInit {
  private readonly flow = inject(FlowService);
  private readonly translate = inject(TranslateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly projectId = input.required<string>();
  /** The objective to edit; null creates one. */
  readonly objective = input<Objective | null>(null);
  /** Horizon a new objective starts in. */
  readonly horizon = input<Horizon>('short');

  readonly close = output<void>();
  readonly created = output<Objective>();

  readonly horizons = HORIZONS;
  readonly statuses = STATUSES;

  // Seeded once: the modal is created per use, so there is nothing to re-sync.
  readonly title = signal('');
  readonly description = signal('');
  readonly draftHorizon = signal<Horizon>('short');
  readonly status = signal<ObjectiveStatus>('active');
  readonly targetDate = signal('');

  readonly editing = computed(() => this.objective() !== null);
  readonly canSave = computed(() => !!this.title().trim());

  constructor() {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('input')?.focus());
  }

  ngOnInit(): void {
    const objective = this.objective();
    this.title.set(objective?.title ?? '');
    this.description.set(objective?.description ?? '');
    this.draftHorizon.set(objective?.horizon ?? this.horizon());
    this.status.set(objective?.status ?? 'active');
    this.targetDate.set(objective?.targetDate ?? '');
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }

  save(): void {
    if (!this.canSave()) return;
    const description = this.description().trim();
    const targetDate = isIsoDate(this.targetDate()) ? this.targetDate() : undefined;
    const current = this.objective();
    if (current) {
      this.flow.updateObjective(current.id, {
        title: this.title(),
        description: description || undefined,
        horizon: this.draftHorizon(),
        status: this.status(),
        targetDate,
      });
    } else {
      const added = this.flow.addObjective({
        projectId: this.projectId(),
        title: this.title(),
        description: description || undefined,
        horizon: this.draftHorizon(),
        status: this.status(),
        targetDate,
      });
      if (added) this.created.emit(added);
    }
    this.close.emit();
  }

  remove(): void {
    const current = this.objective();
    if (!current) return;
    if (!window.confirm(this.translate.instant('flow.objective.deleteConfirm'))) return;
    this.flow.removeObjective(current.id);
    this.close.emit();
  }
}
