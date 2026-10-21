import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AccountService } from '../../../services/account.service';
import { SettingsService, type Language, type Theme } from '../../../services/settings.service';
import { ViewService, type ConfigSection } from '../../../services/view.service';
import { AccountSettingsComponent } from '../account-settings/account-settings.component';
import { ForgeConnectionsSettingsComponent } from '../forge-connections-settings/forge-connections-settings.component';
import { SportaskSettingsComponent } from '../sportask-settings/sportask-settings.component';
import { ConfigLeaveGuard } from './config-leave-guard';

const SCROLL_LOCK_CLASS = 'planning-lab-open';

interface ThemeOption {
  id: Theme;
  // Hard-coded preview colours: the swatch shows a theme other than the active one, so it cannot use the tokens.
  bg: string;
  surface: string;
  primary: string;
  text: string;
}

const THEMES: ThemeOption[] = [
  { id: 'light', bg: '#fff8f0', surface: '#f5e6d3', primary: '#e85d2f', text: '#3b2a20' },
  { id: 'dark', bg: '#282a36', surface: '#44475a', primary: '#bd93f9', text: '#f8f8f2' },
  { id: 'japanese', bg: '#f4efe4', surface: '#e8e0cc', primary: '#b5343a', text: '#2b2b2b' },
  { id: 'nordic', bg: '#eceff4', surface: '#e5e9f0', primary: '#5e81ac', text: '#2e3440' },
];

const LANGUAGES: { id: Language; nativeName: string }[] = [
  { id: 'en', nativeName: 'English' },
  { id: 'es', nativeName: 'Español' },
];

/**
 * The application's Configuration dialog: language, theme and account. Rendered by AppComponent from
 * `ViewService.configOpen`, so the menu and the header's account chip can open it over any view.
 */
@Component({
  selector: 'app-config-modal',
  standalone: true,
  imports: [TranslatePipe, AccountSettingsComponent, ForgeConnectionsSettingsComponent, SportaskSettingsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './config-modal.component.html',
  styleUrl: './config-modal.component.css',
  providers: [ConfigLeaveGuard],
})
export class ConfigModalComponent {
  private readonly view = inject(ViewService);
  readonly settings = inject(SettingsService);
  readonly accounts = inject(AccountService);
  private readonly leaveGuard = inject(ConfigLeaveGuard);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  readonly section = this.view.configSection;
  readonly themes = THEMES;
  readonly languages = LANGUAGES;
  readonly sections: ConfigSection[] = this.accounts.enabled ? ['general', 'integrations', 'sportask', 'account'] : ['general', 'integrations', 'sportask'];

  constructor() {
    // The account section only exists while sync is enabled.
    if (!this.accounts.enabled && this.section() === 'account') this.section.set('general');
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add(SCROLL_LOCK_CLASS);
    afterNextRender(() => this.panel()?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => {
      document.body.classList.remove(SCROLL_LOCK_CLASS);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    });
  }

  close(): void {
    this.leaveGuard.leave(() => this.view.closeConfiguration());
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  selectSection(section: ConfigSection): void {
    if (section === this.section()) return;
    this.leaveGuard.leave(() => this.section.set(section));
  }

  setTheme(theme: Theme): void {
    this.settings.setTheme(theme);
  }

  setLanguage(language: Language): void {
    this.settings.setLanguage(language);
  }
}
