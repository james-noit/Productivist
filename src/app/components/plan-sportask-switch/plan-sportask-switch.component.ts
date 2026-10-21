import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../../../services/settings.service';
import { SportDataService } from '../../../services/sport-data.service';
import { SportaskSettingsService } from '../../../services/sportask-settings.service';
import { SportaskService } from '../../../services/sportask.service';
import { SportaskOffHintComponent } from '../sportask-off-hint/sportask-off-hint.component';
import { SportaskSetupSheetComponent } from '../sportask-setup-sheet/sportask-setup-sheet.component';

type GoalsModule = typeof import('../../../lib/sportask/goals');
type TemplatesModule = typeof import('../../../lib/sportask/templates');
type TextsModule = typeof import('../../../lib/sportask/texts');

/**
 * The *Sportask* switch in the footer of Plan my day's step 3 (PLAN 7.3). While Sportask is switched off in Configuration it is muted and `aria-disabled` and shows `sportask-off-hint` instead. On means "start a Sportask session when this plan
 * launches" (`SportaskService.armed`, which the launch functions of `daily-backlog-view` hand to `activateArmed`). Turning it
 * on with nothing armed opens the setup sheet in planner context; *Change...* reopens it; turning it off disarms. The sheet
 * sits above the wizard (`--modal-z`) and handles its own Escape. Lazy: the strings and the goal and template names are
 * fetched when the switch first has something to say.
 */
@Component({
  selector: 'app-plan-sportask-switch',
  standalone: true,
  imports: [TranslatePipe, SportaskOffHintComponent, SportaskSetupSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-sportask-switch.component.html',
  styleUrl: './plan-sportask-switch.component.css',
})
export class PlanSportaskSwitchComponent {
  private readonly sportask = inject(SportaskService);
  private readonly store = inject(SportaskSettingsService);
  private readonly data = inject(SportDataService);
  private readonly appSettings = inject(SettingsService);
  private readonly translate = inject(TranslateService);

  protected readonly enabled = this.store.enabled;
  protected readonly armed = this.sportask.armed;
  protected readonly on = computed(() => this.armed() !== null);
  protected readonly sheetOpen = signal(false);
  protected readonly ready = signal(false);
  private readonly names = signal<{ goals: GoalsModule; templates: TemplatesModule; texts: TextsModule } | null>(null);

  constructor() {
    // An armed plan from an earlier visit: the summary needs the strings and names.
    if (this.armed()) void this.load();
    // Sportask was switched off (here, or on another device) while a plan was armed: the launch must not start a session.
    effect(() => {
      if (!this.enabled()) untracked(() => this.armed.set(null));
    });
  }

  protected readonly summary = computed(() => {
    const armed = this.armed();
    const loaded = this.names();
    if (!armed || !loaded || !this.ready()) return '';
    const lang = this.appSettings.language();
    const { goals, templates, texts } = loaded;
    const c = armed.cadence;
    const m = (s: number): string => String(Math.round((s / 60) * 10) / 10);
    const rhythm = `${m(c.focusSeconds)}/${m(c.breakSeconds)}`;
    let what: string;
    if (armed.mode === 'goal') {
      const goalId = (this.store.settings() as { enrolment?: { goalId?: unknown } } | null)?.enrolment?.goalId;
      const goal = typeof goalId === 'string' ? goals.GOALS.get(goalId) : undefined;
      what = this.translate.instant('sportask.btn.goal', { name: texts.localize(goal?.name, lang) });
    } else {
      const free = this.translate.instant('sportask.btn.free');
      const id = armed.templateId;
      const template = id ? (templates.BUILTIN_TEMPLATES.get(id) ?? this.data.templates().find((t) => t.id === id)) : undefined;
      const name = template ? (template.nameText ? texts.localize(template.nameText, lang) : template.name) : this.translate.instant('sportask.setup.random');
      what = `${free} · ${name}`;
    }
    return `${what} · ${rhythm}`;
  });

  private async load(): Promise<void> {
    if (this.names()) return;
    const [goals, templates, texts] = await Promise.all([
      import('../../../lib/sportask/goals'),
      import('../../../lib/sportask/templates'),
      import('../../../lib/sportask/texts'),
    ]);
    await texts.loadSportaskTexts(this.translate);
    this.names.set({ goals, templates, texts });
    this.ready.set(true);
  }

  protected toggle(): void {
    if (this.on()) this.armed.set(null);
    else this.sheetOpen.set(true);
  }

  protected change(): void {
    this.sheetOpen.set(true);
  }

  protected sheetClosed(): void {
    this.sheetOpen.set(false);
    if (this.armed()) void this.load();
  }
}
