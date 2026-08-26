import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SettingsService, type Language } from '../../../services/settings.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './language-selector.component.html',
  styleUrl: './language-selector.component.css',
})
export class LanguageSelectorComponent {
  readonly settings = inject(SettingsService);

  onChange(event: Event): void {
    this.settings.setLanguage((event.target as HTMLSelectElement).value as Language);
  }
}
