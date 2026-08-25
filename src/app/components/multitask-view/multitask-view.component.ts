import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MultitaskService } from '../../../services/multitask.service';
import { ClockService } from '../../../services/clock.service';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { TodosService } from '../../../services/todos.service';
import {
  SettingsService,
  MIN_DURATION_SECONDS,
  MAX_FOCUS_SECONDS,
  MAX_BREAK_SECONDS,
} from '../../../services/settings.service';
import { MultitaskTaskRowComponent } from '../multitask-task-row/multitask-task-row.component';
import { MultitaskTaskDrawerComponent } from '../multitask-task-drawer/multitask-task-drawer.component';
import { ClockSettingsComponent } from '../clock-settings/clock-settings.component';
import { EffectivityCardComponent } from '../effectivity-card/effectivity-card.component';

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
    EffectivityCardComponent,
  ],
  templateUrl: './multitask-view.component.html',
  styleUrl: './multitask-view.component.css',
})
export class MultitaskViewComponent {
  readonly multitask = inject(MultitaskService);
  readonly clock = inject(ClockService);
  readonly dailyPlan = inject(DailyPlanService);
  private readonly settings = inject(SettingsService);
  private readonly todos = inject(TodosService);

  readonly hasNextLot = computed(
    () => this.dailyPlan.activeLotIndex() + 1 < this.dailyPlan.executionLots().length,
  );

  readonly canAdvanceLot = computed(() => {
    const lots = this.dailyPlan.executionLots();
    const lot = lots[this.dailyPlan.activeLotIndex()];
    if (!lot) return false;
    const assigned = this.multitask.assignedTaskIds();
    return !lot.taskIds.some((id) => assigned.has(id));
  });

  taskTitle(id: string): string {
    return this.todos.todos().find((t) => t.id === id)?.title ?? '';
  }

  advanceLot(): void {
    const lots = this.dailyPlan.executionLots();
    const nextIndex = this.dailyPlan.activeLotIndex() + 1;
    const nextLot = lots[nextIndex];
    if (!nextLot) return;
    for (const taskId of nextLot.taskIds) this.multitask.addCard(taskId);
    this.dailyPlan.setActiveLotIndex(nextIndex);
  }

  readonly formattedTime = computed(() => {
    const minutes = Math.floor(this.clock.remainingSeconds() / 60);
    const seconds = this.clock.remainingSeconds() % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  });

  readonly currentDurationSeconds = computed(() =>
    this.clock.mode() === 'focus' ? this.settings.focusSeconds() : this.settings.breakSeconds(),
  );
  readonly maxDurationSeconds = computed(() => (this.clock.mode() === 'focus' ? MAX_FOCUS_SECONDS : MAX_BREAK_SECONDS));
  readonly canDecreaseDuration = computed(() => !this.clock.running() && this.currentDurationSeconds() > MIN_DURATION_SECONDS);
  readonly canIncreaseDuration = computed(
    () => !this.clock.running() && this.currentDurationSeconds() < this.maxDurationSeconds(),
  );

  readonly borderColor = computed(() => capacityColorVar(this.multitask.cards().length));

  readonly showIterationBanner = computed(() => {
    const lastFocusEndAt = this.clock.lastFocusEndAt();
    return (
      lastFocusEndAt !== null &&
      this.multitask.cards().some((card) => card.taskId !== null && card.lastAnsweredPhaseEndAt !== lastFocusEndAt)
    );
  });
}
