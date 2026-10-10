import { ChangeDetectionStrategy, Component, ElementRef, HostListener, type OnInit, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { isIsoDate, orderedDates } from '../../../lib/dates';
import { ProjectsService } from '../../../services/projects.service';
import type { Milestone } from '../../../types/project';

/** Edits a milestone's name and its start/due days. Used by the Roadmap and the Overview's milestone rows. */
@Component({
  selector: 'app-milestone-dates-modal',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './milestone-dates-modal.component.html',
  styleUrl: './milestone-dates-modal.component.css',
})
export class MilestoneDatesModalComponent implements OnInit {
  private readonly projects = inject(ProjectsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly milestone = input.required<Milestone>();
  readonly close = output<void>();

  // The inputs are seeded once: the modal is created per edit, so there is nothing to re-sync.
  readonly name = signal('');
  readonly startDate = signal('');
  readonly dueDate = signal('');

  readonly hasDates = computed(() => !!this.startDate() || !!this.dueDate());

  constructor() {
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>('input')?.focus();
    });
  }

  /** Seeds the drafts from the milestone (inputs are not available in the constructor). */
  ngOnInit(): void {
    const milestone = this.milestone();
    this.name.set(milestone.name);
    this.startDate.set(milestone.startDate ?? '');
    this.dueDate.set(milestone.dueDate ?? '');
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }

  clearDates(): void {
    this.startDate.set('');
    this.dueDate.set('');
  }

  save(): void {
    const milestone = this.milestone();
    const name = this.name().trim() || milestone.name;
    const start = isIsoDate(this.startDate()) ? this.startDate() : undefined;
    const due = isIsoDate(this.dueDate()) ? this.dueDate() : undefined;
    // Swaps the pair when start is after due, so storage never holds a backwards range from the UI.
    const { startDate, dueDate } = orderedDates(start, due);
    this.projects.updateMilestone(milestone.id, { name, startDate, dueDate });
    this.close.emit();
  }
}
