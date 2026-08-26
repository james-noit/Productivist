import { ApplicationConfig, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideTranslateService({
      defaultLanguage: 'en',
    }),
  ],
};
