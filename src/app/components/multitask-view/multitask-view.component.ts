import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MultitaskService } from '../../../services/multitask.service';
import { ClockService } from '../../../services/clock.service';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { todayIso } from '../../../lib/dates';
import { FINDINGS, findingIndexForDay } from '../../../lib/multitask-research';
import { MultitaskTaskRowComponent } from '../multitask-task-row/multitask-task-row.component';
import { MultitaskTaskDrawerComponent } from '../multitask-task-drawer/multitask-task-drawer.component';
import { ClockSettingsComponent } from '../clock-settings/clock-settings.component';
import { SportaskService } from '../../../services/sportask.service';
import { SportaskButtonComponent } from '../sportask-button/sportask-button.component';
import { EffectivityCardComponent } from '../effectivity-card/effectivity-card.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import { SideDrawerComponent } from '../side-drawer/side-drawer.component';
import { LotEditorComponent } from '../lot-editor/lot-editor.component';
import type { CarryMode } from '../../../lib/execution-lots';

function capacityColorVar(count: number): string {
  if (count <= 2) return 'var(--color-capacity-safe)';
  if (count === 3) return 'var(--color-capacity-elevated)';
  if (count <= 5) return 'var(--color-capacity-high)';
  return 'var(--color-capacity-critical)';
}

@Component({
  selector: 'app-multitask-view',
  standalone: true,
  imports: [
    TranslatePipe,
    MultitaskTaskRowComponent,
    MultitaskTaskDrawerComponent,
    ClockSettingsComponent,
    SportaskButtonComponent,
    EffectivityCardComponent,
    UiIconComponent,
    SideDrawerComponent,
    LotEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './multitask-view.component.html',
  styleUrl: './multitask-view.component.css',
})
export class MultitaskViewComponent {
  readonly multitask = inject(MultitaskService);
  readonly clock = inject(ClockService);
  readonly sportask = inject(SportaskService);
  readonly dailyPlan = inject(DailyPlanService);
  private readonly todos = inject(TodosService);
  private readonly settings = inject(SettingsService);

  // --- Execution lots: the strip, "Next lot" (asks about unfinished tasks) and the Edit lots drawer ---

  private readonly injector = inject(Injector);
  private readonly nextButton = viewChild<ElementRef<HTMLElement>>('nextButton');
  private readonly lotsHeading = viewChild<ElementRef<HTMLElement>>('lotsHeading');
  private readonly takeAlongButton = viewChild<ElementRef<HTMLElement>>('takeAlong');
  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');

  readonly editingLots = signal(false);
  readonly asking = signal(false);

  /** id -> title and the done ids: what the strip and the lot editor read instead of searching the todos. */
  readonly titles = computed(() => new Map(this.todos.todos().map((t) => [t.id, t.title] as const)));
  readonly doneIds = computed(() => new Set(this.todos.todos().filter((t) => t.done).map((t) => t.id)));

  readonly isLastLot = computed(() => this.dailyPlan.activeLotIndex() + 1 >= this.dailyPlan.executionLots().length);
  readonly unfinishedCount = computed(() => this.multitask.unfinishedInActiveLot().length);

  readonly stripLots = computed(() => {
    const active = this.dailyPlan.activeLotIndex();
    const titles = this.titles();
    const done = this.doneIds();
    return this.dailyPlan.executionLots().map((lot, i) => ({
      id: lot.id,
      n: i + 1,
      active: i === active,
      past: i < active,
      tasks: lot.taskIds.filter((id) => titles.has(id)).map((id) => ({ id, title: titles.get(id) ?? '', done: done.has(id) })),
    }));
  });

  requestNextLot(): void {
    if (this.unfinishedCount() === 0) {
      this.advance('carry');
      return;
    }
    this.asking.set(true);
    afterNextRender(() => this.takeAlongButton()?.nativeElement.focus(), { injector: this.injector });
  }

  advance(mode: CarryMode): void {
    this.asking.set(false);
    this.multitask.advanceLot(mode);
    this.restoreFocus();
  }

  dismissQuestion(): void {
    if (!this.asking()) return;
    this.asking.set(false);
    this.restoreFocus();
  }

  /** Back to "Next lot", or to the strip's heading, or (once the plan is finished and the strip is gone) to the view. */
  private restoreFocus(): void {
    afterNextRender(
      () => (this.nextButton() ?? this.lotsHeading() ?? this.root()).nativeElement.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }

  /** The drawer swallows Escape itself; this is for the question when focus is not inside it. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.dismissQuestion();
  }

  // --- Research tip: the day's finding, "Another one" steps on, the ✕ hides it for today ---

  private readonly today = todayIso();
  private readonly baseIndex = findingIndexForDay(this.today, FINDINGS.length);
  /** Moved by "Another one"; deliberately not persisted, so a reload shows the day's pick again. */
  private readonly offset = signal(0);

  readonly tip = computed(() => {
    if (this.multitask.researchTipsOff() || this.multitask.tipHiddenOn() === this.today) return null;
    const finding = FINDINGS[(this.baseIndex + this.offset()) % FINDINGS.length];
    return {
      text: this.settings.language() === 'es' ? finding.es : finding.en,
      authors: finding.authors,
      year: finding.year,
      venue: finding.venue,
      doi: finding.doi,
      url: `https://doi.org/${finding.doi}`,
    };
  });

  private readonly doiLink = viewChild<ElementRef<HTMLAnchorElement>>('doiLink');

  constructor() {
    // The href is set by hand: a bound `[href]` pulls Angular's URL sanitizer (~0.7 kB) into the initial bundle,
    // and this URL is always `https://doi.org/` plus a DOI from the bank.
    effect(() => {
      const link = this.doiLink()?.nativeElement;
      const tip = this.tip();
      if (link && tip) link.href = tip.url;
    });
    if (this.tip()) this.rememberTip((this.baseIndex + this.offset()) % FINDINGS.length);
  }

  private rememberTip(index: number): void {
    const id = FINDINGS[index].id;
    this.multitask.tipRecent.update((list) => (list[list.length - 1] === id ? list : [...list.filter((x) => x !== id), id].slice(-5)));
  }

  /** The next finding that is not among the last five shown. */
  anotherTip(): void {
    const recent = new Set(this.multitask.tipRecent());
    for (let step = 1; step <= FINDINGS.length; step++) {
      const offset = this.offset() + step;
      const index = (this.baseIndex + offset) % FINDINGS.length;
      if (recent.has(FINDINGS[index].id)) continue;
      this.offset.set(offset);
      this.rememberTip(index);
      return;
    }
  }

  hideTipToday(): void {
    this.multitask.tipHiddenOn.set(this.today);
  }

  readonly borderColor = computed(() => capacityColorVar(this.multitask.cards().length));

  readonly showIterationBanner = computed(() => {
    const lastFocusEndAt = this.clock.lastFocusEndAt();
    return (
      lastFocusEndAt !== null &&
      this.multitask.cards().some((card) => card.taskId !== null && card.lastAnsweredPhaseEndAt !== lastFocusEndAt)
    );
  });
}
