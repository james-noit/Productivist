import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SettingsService, type Theme } from '../../../services/settings.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.css',
})
export class ThemeToggleComponent {
  readonly settings = inject(SettingsService);

  onChange(event: Event): void {
    this.settings.setTheme((event.target as HTMLSelectElement).value as Theme);
  }
}
