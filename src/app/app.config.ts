import { ApplicationConfig } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideTranslateService({
      defaultLanguage: 'en',
    }),
  ],
};
