import { Component, effect, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../services/settings.service';
import { MultitaskService } from '../services/multitask.service';
import { ViewService } from '../services/view.service';
import { AppHeaderComponent } from './components/app-header/app-header.component';
import { PomodoroClockComponent } from './components/pomodoro-clock/pomodoro-clock.component';
import { TodoListComponent } from './components/todo-list/todo-list.component';
import { MultitaskViewComponent } from './components/multitask-view/multitask-view.component';
import { EisenhowerViewComponent } from './components/eisenhower-view/eisenhower-view.component';
import { PlanningLabViewComponent } from './components/planning-lab-view/planning-lab-view.component';
import en from '../i18n/locales/en.json';
import es from '../i18n/locales/es.json';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    AppHeaderComponent,
    PomodoroClockComponent,
    TodoListComponent,
    MultitaskViewComponent,
    EisenhowerViewComponent,
    PlanningLabViewComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  private readonly settings = inject(SettingsService);
  readonly multitask = inject(MultitaskService);
  readonly view = inject(ViewService);
  private readonly translate = inject(TranslateService);

  constructor() {
    this.translate.setTranslation('en', en);
    this.translate.setTranslation('es', es);

    effect(() => {
      document.documentElement.setAttribute('data-theme', this.settings.theme());
    });

    effect(() => {
      const language = this.settings.language();
      this.translate.use(language);
      document.documentElement.setAttribute('lang', language);
    });
  }
}
