import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { ViewService } from '../../../services/view.service';
import { DailyBacklogViewComponent } from '../daily-backlog-view/daily-backlog-view.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

const SCROLL_LOCK_CLASS = 'planning-lab-open';

/**
 * The daily-backlog wizard in a large dialog. Rendered by AppComponent from `ViewService.planningOpen`,
 * so it can open over any view. The wizard's stage and assignments are persisted by DailyPlanService, so
 * closing never loses progress. "Start over" lives in the header (reachable from every step) and asks
 * through an inline confirm bar.
 */
@Component({
  selector: 'app-planning-lab-modal',
  standalone: true,
  imports: [TranslatePipe, DailyBacklogViewComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planning-lab-modal.component.html',
  styleUrl: './planning-lab-modal.component.css',
})
export class PlanningLabModalComponent {
  private readonly view = inject(ViewService);
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly startOverButton = viewChild<ElementRef<HTMLElement>>('startOverButton');
  private readonly confirmFocus = viewChild<ElementRef<HTMLElement>>('confirmFocus');

  readonly confirm = signal<'startOver' | null>(null);

  /** Only while there is something to clear. */
  readonly canStartOver = computed(() => this.dailyPlan.stage() !== 'prompt' || this.dailyPlan.hasAnyObjective());

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
    if (event.target !== event.currentTarget) return;
    if (this.confirm()) this.dismissConfirm();
    else this.close();
  }

  askStartOver(): void {
    this.confirm.set('startOver');
    afterNextRender(() => this.confirmFocus()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Dismisses the question, not the modal, and puts focus back on the header button. */
  dismissConfirm(): void {
    this.confirm.set(null);
    afterNextRender(() => (this.startOverButton() ?? this.panel())?.nativeElement.focus(), { injector: this.injector });
  }

  startOver(): void {
    this.confirm.set(null);
    this.dailyPlan.startOver();
    afterNextRender(
      () => {
        const panel = this.panel()?.nativeElement;
        const input = panel?.querySelector<HTMLElement>('.daily-backlog-prompt__input');
        (input ?? panel)?.focus();
      },
      { injector: this.injector },
    );
  }

  /** The wizard's own modals (tasks, overwrite confirm, task detail...) are nested overlays: Escape belongs to them first. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (document.querySelectorAll('.modal-overlay').length > 1) return;
    if (this.confirm()) this.dismissConfirm();
    else this.close();
  }
}
