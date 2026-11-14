import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { API_ENABLED } from '../../../core/api';
import { downloadIcs, googleEventUrl, outlookEventUrl, type CalendarEvent } from '../../../lib/calendar-links';
import { loadCalendarTexts } from '../../../lib/calendar-texts';
import { ExternalHrefDirective } from '../../directives/external-href.directive';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * Task Details' "Add to calendar" row (lazy, shown while the task has a due date): Google and Outlook open a prefilled
 * all-day event on their site, Proton downloads an .ics to import. A one-off copy; the subscription in Configuration >
 * Integrations is what keeps a calendar in step.
 */
@Component({
  selector: 'app-add-to-calendar',
  standalone: true,
  imports: [TranslatePipe, ExternalHrefDirective, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ready()) {
      <div class="field atc" role="group" [attr.aria-labelledby]="labelId">
        <span class="field__label" [id]="labelId">{{ 'calSync.field' | translate }}</span>
        <div class="atc__row">
          <a class="btn btn--secondary btn--sm" [appExternalHref]="links().google" [attr.aria-label]="'calSync.addTo' | translate: { name: 'Google Calendar' }">
            <app-ui-icon name="calendar" [size]="14" />
            Google ↗
          </a>
          <a class="btn btn--secondary btn--sm" [appExternalHref]="links().outlook" [attr.aria-label]="'calSync.addTo' | translate: { name: 'Outlook' }">
            <app-ui-icon name="calendar" [size]="14" />
            Outlook ↗
          </a>
          <button type="button" class="btn btn--secondary btn--sm" [title]="'calSync.protonHint' | translate" (click)="download()">
            <app-ui-icon name="calendar" [size]="14" />
            {{ 'calSync.proton' | translate }}
          </button>
        </div>
        <p class="atc__hint">
          @if (downloaded()) {
            {{ 'calSync.protonHint' | translate }}
          } @else {
            {{ 'calSync.oneOff' | translate }}
            @if (canSubscribe) {
              {{ 'calSync.subscribeHint' | translate }}
            }
          }
        </p>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .atc__row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    a.btn {
      text-decoration: none;
    }
    .atc__hint {
      margin: 0;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
  `,
})
export class AddToCalendarComponent {
  readonly event = input.required<CalendarEvent>();

  readonly ready = signal(false);
  readonly downloaded = signal(false);
  readonly canSubscribe = API_ENABLED;
  readonly labelId = `atc-${Math.random().toString(36).slice(2, 8)}`;
  readonly links = computed(() => ({ google: googleEventUrl(this.event()), outlook: outlookEventUrl(this.event()) }));

  constructor() {
    void loadCalendarTexts(inject(TranslateService)).then(() => this.ready.set(true));
  }

  download(): void {
    downloadIcs(this.event());
    this.downloaded.set(true);
  }
}
