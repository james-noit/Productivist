import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService, type Language } from '../services/settings.service';
import { MultitaskService } from '../services/multitask.service';
import { ViewService } from '../services/view.service';
import { SyncService } from '../services/sync.service';
import { AccountService } from '../services/account.service';
import { AppHeaderComponent } from './components/app-header/app-header.component';
import { PomodoroClockComponent } from './components/pomodoro-clock/pomodoro-clock.component';
import { TodoListComponent } from './components/todo-list/todo-list.component';
import { MultitaskViewComponent } from './components/multitask-view/multitask-view.component';
import { PlanningLabModalComponent } from './components/planning-lab-modal/planning-lab-modal.component';
import { ConfigModalComponent } from './components/config-modal/config-modal.component';
import { ProjectsViewComponent } from './components/projects-view/projects-view.component';
import { AdminViewComponent } from './components/admin-view/admin-view.component';
import en from '../i18n/locales/en.json';

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
    ProjectsViewComponent,
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
  readonly accounts = inject(AccountService);
  private readonly translate = inject(TranslateService);

  private readonly loaded = new Set<Language>(['en']);

  constructor() {
    // Instantiated for its side effects: it syncs in the background while signed in.
    inject(SyncService);

    // English is the default and the fallback, so it is bundled. Every other locale is
    // fetched on demand — shipping them all eagerly cost ~11 kB for a language most
    // users never switch to.
    this.translate.setTranslation('en', en);

    effect(() => {
      document.documentElement.setAttribute('data-theme', this.settings.theme());
    });

    effect(() => {
      const language = this.settings.language();
      document.documentElement.setAttribute('lang', language);
      void this.useLanguage(language);
    });
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
