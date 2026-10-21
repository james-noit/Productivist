import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ClockService } from '../../../services/clock.service';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { MultitaskService } from '../../../services/multitask.service';
import { SportaskService } from '../../../services/sportask.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import { PomodoroPopoverComponent } from '../pomodoro-popover/pomodoro-popover.component';

/**
 * The header's Pomodoro chip: while a session is running, or paused partway through, and the user is somewhere other
 * than the Pomodoro view, it shows the phase (a dot, or two bars when paused), the time left and, from 700px up,
 * the current task (or "Multitask · N" / the lot). It is in the initial bundle, so it stays small: no `ui-icon`, no
 * forms, inline SVG only (a small dumbbell mark shows while a Sportask session is active). Its click opens `pomodoro-popover`, which is lazy. The `role="status"` note announces only
 * that a phase ended (the time itself ticks every second and is never a live region).
 */
@Component({
  selector: 'app-pomodoro-chip',
  standalone: true,
  imports: [PomodoroPopoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pomodoro-chip.component.html',
  styleUrl: './pomodoro-chip.component.css',
})
export class PomodoroChipComponent {
  readonly clock = inject(ClockService);
  readonly todos = inject(TodosService);
  readonly multitask = inject(MultitaskService);
  readonly sportask = inject(SportaskService);
  private readonly plan = inject(DailyPlanService);
  private readonly view = inject(ViewService);
  private readonly translate = inject(TranslateService);
  private readonly button = viewChild<ElementRef<HTMLButtonElement>>('chip');

  readonly open = signal(false);

  readonly visible = computed(() => this.view.current() !== 'pomodoro' && this.clock.inSession() && !this.clock.alarmModalOpen());

  /** Bumped when the language changes, so the texts below are built again. */
  private readonly language = signal(0);

  /** Multitask: the active lot as { n, m } when the plan has lots, else the number of cards that hold a task. */
  private readonly lot = computed(() => {
    const m = this.plan.executionLots().length;
    return m ? { n: Math.min(this.plan.activeLotIndex(), m - 1) + 1, m } : null;
  });
  private readonly cardCount = computed(() => this.multitask.cards().reduce((n, card) => (card.taskId ? n + 1 : n), 0));

  /**
   * What the chip says besides the time, built in code rather than with a pipe per fragment: the full accessible
   * name and the text next to the time (from 700px). Only read while the chip shows.
   */
  readonly texts = computed(() => {
    this.language();
    const t = (key: string, params?: object): string => this.translate.instant(key, params);
    const multi = this.multitask.enabled();
    const mode = t(this.clock.mode() === 'focus' ? 'clock.focus' : 'clock.break');
    const lot = this.lot();
    const lotText = lot ? t('chip.lot', lot) : '';
    const title = this.todos.currentTask()?.title ?? '';
    const multitask = t('multitask.toggleLabel');
    const detail = multi ? lotText : title;
    return {
      label: t('chip.label', {
        mode: multi ? `${multitask} · ${mode}` : mode,
        state: this.clock.running() ? '' : ` (${t('chip.paused')})`,
        time: this.clock.formattedTime(),
        detail: (detail ? `, ${detail}` : '') + (this.sportask.active() ? `, ${t('config.sportask')}` : ''),
      }),
      extra: multi ? `${multitask} · ${lotText || this.cardCount()}` : title || mode,
    };
  });

  /** Set while a phase has just ended and its dialog is still waiting on another view: the one thing announced. */
  readonly note = computed(() => {
    this.language();
    if (!this.clock.sessionModalOpen() || this.view.current() === 'pomodoro') return '';
    // After the switch the mode is the next one: 'break' means focus has ended.
    return this.translate.instant(this.clock.mode() === 'break' ? 'chip.focusEnded' : 'chip.breakEnded');
  });

  constructor() {
    const changes = this.translate.onLangChange.subscribe(() => this.language.update((n) => n + 1));
    inject(DestroyRef).onDestroy(() => changes.unsubscribe());
    // The popover goes with the chip (it is gone on the Pomodoro view, and when the session ends).
    effect(() => {
      if (!this.visible()) this.open.set(false);
    });
  }

  toggle(): void {
    this.open.update((open) => !open);
  }

  /** The popover closed itself; Escape and the buttons inside put focus back on the chip. */
  onClosed(restoreFocus: boolean): void {
    this.open.set(false);
    if (restoreFocus) this.button()?.nativeElement.focus();
  }
}
