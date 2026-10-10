import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ViewService } from '../../../services/view.service';
import { DailyBacklogViewComponent } from '../daily-backlog-view/daily-backlog-view.component';

const SCROLL_LOCK_CLASS = 'planning-lab-open';

/**
 * The daily-backlog wizard in a large dialog. Rendered by AppComponent from `ViewService.planningOpen`,
 * so it can open over any view. The wizard's stage and assignments are persisted by DailyPlanService, so
 * closing never loses progress.
 */
@Component({
  selector: 'app-planning-lab-modal',
  standalone: true,
  imports: [TranslatePipe, DailyBacklogViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planning-lab-modal.component.html',
  styleUrl: './planning-lab-modal.component.css',
})
export class PlanningLabModalComponent {
  private readonly view = inject(ViewService);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add(SCROLL_LOCK_CLASS);
    afterNextRender(() => this.panel()?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => {
      document.body.classList.remove(SCROLL_LOCK_CLASS);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    });
  }

  close(): void {
    this.view.closePlanning();
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  /** The wizard's own modals (tasks, overwrite confirm, task detail...) are nested overlays: Escape belongs to them first. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (document.querySelectorAll('.modal-overlay').length > 1) return;
    this.close();
  }
}
