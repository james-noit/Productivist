import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { trapTab } from '../../../lib/focus-trap';
import { CATALOG } from '../../../lib/sportask/catalog';
import { type ResultRow, resultsFromRows, rowsFromBlock, statusFromRows } from '../../../lib/sportask/results';
import { localize } from '../../../lib/sportask/texts';
import { SportDataService } from '../../../services/sport-data.service';
import type { Feedback, SportBlock } from '../../../types/sportask';
import { SportaskResultsFormComponent } from '../sportask-results-form/sportask-results-form.component';
import { SportPanelState } from '../sportask-view/sport-panel.state';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

type Confirm = 'discard' | null;

/**
 * "Edit marks": the Results form on a block already in the history. Follows the Task Details pattern: the form edits a local
 * draft against a snapshot taken at open, nothing is written until *Save changes* (disabled until something changed), Ctrl/Cmd+Enter
 * also saves, and closing a changed draft asks first. Saving rewrites the block's results, status, effort and feeling in one
 * `updateBlock`, so every chart and the sync see the edit.
 */
@Component({
  selector: 'app-sportask-marks-modal',
  standalone: true,
  imports: [TranslatePipe, SportaskResultsFormComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-marks-modal.component.html',
  styleUrl: './sportask-marks-modal.component.css',
})
export class SportaskMarksModalComponent {
  readonly block = input.required<SportBlock>();
  readonly closed = output<void>();

  private readonly data = inject(SportDataService);
  protected readonly state = inject(SportPanelState);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly confirmFocus = viewChild<ElementRef<HTMLButtonElement>>('confirmFocus');
  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private pressedOnBackdrop = false;

  protected readonly confirm = signal<Confirm>(null);
  protected readonly isTest = computed(() => this.block().kind === 'test');

  protected readonly rows = linkedSignal<string, ResultRow[]>({
    source: () => this.block().id,
    computation: () => rowsFromBlock(this.block(), CATALOG, (id) => this.state.exerciseName(id)),
  });
  protected readonly feedback = linkedSignal<string, Feedback | null>({ source: () => this.block().id, computation: () => this.block().feedback ?? null });
  protected readonly rpe = linkedSignal<string, number | null>({ source: () => this.block().id, computation: () => this.block().rpe ?? null });

  /** What the form started with; the draft is compared against it. */
  private readonly baseline = computed(() => {
    const b = this.block();
    return JSON.stringify([rowsFromBlock(b, CATALOG, () => ''), b.feedback ?? null, b.rpe ?? null]);
  });
  protected readonly dirty = computed(() => JSON.stringify([this.rows().map((r) => ({ ...r, name: '' })), this.feedback(), this.rpe()]) !== this.baseline());

  /** "Monday 9 Mar · 10:30 · Push-ups" style description of the block being edited. */
  protected readonly subtitle = computed(() => {
    const b = this.block();
    const time = new Intl.DateTimeFormat(this.state.lang(), { hour: '2-digit', minute: '2-digit' }).format(new Date(b.startedAt));
    const assessment = b.assessmentId ? localize(CATALOG.assessments.get(b.assessmentId)?.name, this.state.lang()) : '';
    return [this.state.dayLabel(b.date), time, assessment].filter(Boolean).join(' · ');
  });

  constructor() {
    afterNextRender(() => this.panel().nativeElement.focus({ preventScroll: true }));
    inject(DestroyRef).onDestroy(() => {
      if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    });
  }

  protected requestClose(): void {
    if (this.confirm()) this.dismissConfirm();
    else if (this.dirty()) {
      this.confirm.set('discard');
      afterNextRender(() => this.confirmFocus()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
    } else this.closed.emit();
  }

  protected dismissConfirm(): void {
    this.confirm.set(null);
    afterNextRender(() => this.panel().nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  protected discard(): void {
    this.closed.emit();
  }

  protected save(): void {
    if (!this.dirty()) return;
    const rows = this.rows();
    const patch: Partial<Omit<SportBlock, 'id'>> = {
      results: resultsFromRows(rows),
      status: statusFromRows(rows),
      rpe: this.rpe() ?? undefined,
    };
    // A test has no "how it felt"; leave whatever the block had.
    if (!this.isTest()) patch.feedback = this.feedback() ?? undefined;
    this.data.updateBlock(this.block().id, patch);
    this.closed.emit();
  }

  protected onBackdropDown(event: MouseEvent): void {
    this.pressedOnBackdrop = event.target === event.currentTarget;
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (this.pressedOnBackdrop && event.target === event.currentTarget) this.requestClose();
    this.pressedOnBackdrop = false;
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.requestClose();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      if (!this.confirm()) this.save();
    } else {
      trapTab(event, this.panel().nativeElement);
    }
  }
}
