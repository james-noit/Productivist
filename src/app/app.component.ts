import { ChangeDetectionStrategy, Component, Injector, effect, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService, type Language } from '../services/settings.service';
import { ClockService } from '../services/clock.service';
import { MultitaskService } from '../services/multitask.service';
import { ViewService } from '../services/view.service';
import { SyncService } from '../services/sync.service';
import { ProjectsService } from '../services/projects.service';
import { RecurrenceService } from '../services/recurrence.service';
import { AccountService } from '../services/account.service';
import { AppHeaderComponent } from './components/app-header/app-header.component';
import { PomodoroClockComponent } from './components/pomodoro-clock/pomodoro-clock.component';
import { TodoListComponent } from './components/todo-list/todo-list.component';
import { MultitaskViewComponent } from './components/multitask-view/multitask-view.component';
import { PlanningLabModalComponent } from './components/planning-lab-modal/planning-lab-modal.component';
import { ConfigModalComponent } from './components/config-modal/config-modal.component';
import { AlarmModalComponent } from './components/alarm-modal/alarm-modal.component';
import { RecurringTasksModalComponent } from './components/recurring-tasks-modal/recurring-tasks-modal.component';
import { ProjectDetailViewComponent } from './components/project-detail-view/project-detail-view.component';
import { ProjectsViewComponent } from './components/projects-view/projects-view.component';
import { AdminViewComponent } from './components/admin-view/admin-view.component';
import en from '../i18n/locales/en.json';

/** The bridge Capacitor injects into its WebView; reading it imports nothing. */
type CapacitorGlobal = {
  Capacitor?: { isNativePlatform?: () => boolean; nativePromise?: (plugin: string, method: string, options?: object) => Promise<unknown> };
};

@Component({
  selector: 'app-root',
  standalone: true,
  // Everything but the header is used only inside a @defer block, so the compiler turns
  // these into dynamic imports and gives each view its own chunk.
  imports: [
    AppHeaderComponent,
    PomodoroClockComponent,
    TodoListComponent,
    MultitaskViewComponent,
    PlanningLabModalComponent,
    ConfigModalComponent,
    RecurringTasksModalComponent,
    AlarmModalComponent,
    ProjectsViewComponent,
    ProjectDetailViewComponent,
    AdminViewComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  private readonly settings = inject(SettingsService);
  readonly multitask = inject(MultitaskService);
  readonly view = inject(ViewService);
  readonly clock = inject(ClockService);
  readonly accounts = inject(AccountService);
  private readonly translate = inject(TranslateService);
  private readonly injector = inject(Injector);

  private readonly loaded = new Set<Language>(['en']);

  constructor() {
    // Instantiated for its side effects: it syncs in the background while signed in.
    inject(SyncService);

    // Flow links left pointing at tasks, milestones or projects that were removed while this code did not
    // run (older versions, another device) are dropped once at startup.
    inject(ProjectsService).sweepFlow();

    // Creates the occurrences that came due while the app was closed, and keeps doing so (date change, tab
    // focus, completed occurrences). Instantiated here so it runs without anyone opening the modal.
    inject(RecurrenceService);

    // English is the default and the fallback, so it is bundled. Every other locale is
    // fetched on demand — shipping them all eagerly cost ~11 kB for a language most
    // users never switch to.
    this.translate.setTranslation('en', en);

    this.startNativeApp();

    effect(() => {
      document.documentElement.setAttribute('data-theme', this.settings.theme());
    });

    effect(() => {
      const language = this.settings.language();
      document.documentElement.setAttribute('lang', language);
      void this.useLanguage(language);
    });
  }

  /**
   * In the Android and iOS apps only: back button, end-of-session notification and splash (`src/core/native`).
   * A dynamic import behind the bridge check, so the web build never loads or even contains Capacitor in its
   * initial bundle. If the chunk cannot load the splash is hidden through the bridge so it never sticks.
   */
  private startNativeApp(): void {
    const capacitor = (window as CapacitorGlobal).Capacitor;
    if (!capacitor?.isNativePlatform?.()) return;
    import('../core/native/native-app').then(
      ({ startNative }) => startNative(this.injector),
      () => void capacitor.nativePromise?.('SplashScreen', 'hide', {})?.catch(() => undefined),
    );
  }

  private async useLanguage(language: Language): Promise<void> {
    if (!this.loaded.has(language)) {
      const { default: messages } = await import(`../i18n/locales/${language}.json`);
      this.translate.setTranslation(language, messages);
      this.loaded.add(language);
    }
    this.translate.use(language);
  }
}
