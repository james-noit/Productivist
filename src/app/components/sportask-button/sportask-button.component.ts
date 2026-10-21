import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../../../services/settings.service';
import { SportaskSettingsService } from '../../../services/sportask-settings.service';
import { SportaskService } from '../../../services/sportask.service';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import { SportaskOffHintComponent } from '../sportask-off-hint/sportask-off-hint.component';
import { SportaskSetupSheetComponent } from '../sportask-setup-sheet/sportask-setup-sheet.component';

type GoalsModule = typeof import('../../../lib/sportask/goals');
type TextsModule = typeof import('../../../lib/sportask/texts');

/**
 * The *Sportask* button of the Pomodoro and Multitask views. Sportask switched off (Configuration): the button stays but is `aria-disabled` and shows `sportask-off-hint`. Not started: opens the setup sheet. Active: shown pressed with the rhythm
 * (25/5), and a small popover offers *Change...* (the sheet) and *Leave Sportask*. The sheet is deferred; the strings and the
 * goal names are fetched only when the popover opens, so the view itself carries almost nothing.
 */
@Component({
  selector: 'app-sportask-button',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent, SportaskOffHintComponent, SportaskSetupSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-button.component.html',
  styleUrl: './sportask-button.component.css',
})
export class SportaskButtonComponent {
  readonly source = input<'pomodoro' | 'multitask'>('pomodoro');

  private readonly sportask = inject(SportaskService);
  private readonly store = inject(SportaskSettingsService);
  private readonly appSettings = inject(SettingsService);
  private readonly translate = inject(TranslateService);

  protected readonly enabled = this.store.enabled;
  protected readonly active = this.sportask.active;
  protected readonly menuOpen = signal(false);
  protected readonly sheetOpen = signal(false);
  protected readonly ready = signal(false);
  private readonly names = signal<{ goals: GoalsModule; texts: TextsModule } | null>(null);

  /** "25/5" (the session's focus and break, in minutes). */
  protected readonly rhythm = computed(() => {
    const c = this.sportask.session()?.cadence;
    if (!c) return '';
    const m = (s: number): string => String(Math.round((s / 60) * 10) / 10);
    return `${m(c.focusSeconds)}/${m(c.breakSeconds)}`;
  });

  /** What the popover says the session trains: the enrolled goal's name, or free training. */
  protected readonly what = computed(() => {
    const session = this.sportask.session();
    const loaded = this.names();
    if (!session || !loaded) return null;
    if (session.mode === 'free') return { key: 'sportask.btn.free', name: '' };
    const goalId = (this.store.settings() as { enrolment?: { goalId?: unknown } } | null)?.enrolment?.goalId;
    const goal = typeof goalId === 'string' ? loaded.goals.GOALS.get(goalId) : undefined;
    return { key: 'sportask.btn.goal', name: loaded.texts.localize(goal?.name, this.appSettings.language()) };
  });

  protected click(): void {
    if (!this.active()) {
      this.sheetOpen.set(true);
      return;
    }
    if (this.menuOpen()) {
      this.menuOpen.set(false);
      return;
    }
    this.menuOpen.set(true);
    void this.load();
  }

  private async load(): Promise<void> {
    if (this.ready()) return;
    const [goals, texts] = await Promise.all([import('../../../lib/sportask/goals'), import('../../../lib/sportask/texts')]);
    await texts.loadSportaskTexts(this.translate);
    this.names.set({ goals, texts });
    this.ready.set(true);
  }

  protected change(): void {
    this.menuOpen.set(false);
    this.sheetOpen.set(true);
  }

  protected leave(): void {
    this.menuOpen.set(false);
    this.sportask.stop();
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    this.menuOpen.set(false);
  }
}
