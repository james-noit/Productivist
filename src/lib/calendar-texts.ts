import type { TranslateService } from '@ngx-translate/core';

let started: Promise<void> | null = null;

/**
 * Registers the calendar strings (`src/i18n/calendar-texts.ts`, a lazy chunk) under the `calSync` key (`calendar` belongs to the Calendar presentation), for English and
 * the active language, and again whenever a language is switched or (re)loaded (the app's own `setTranslation` replaces a
 * whole language). Same pattern as `lib/forge-texts.ts`; only lazy components call it and hold their first render on it.
 */
export function loadCalendarTexts(translate: TranslateService): Promise<void> {
  if (started) return started;
  const apply = async (lang: string): Promise<void> => {
    const { CALENDAR_TEXTS } = await import('../i18n/calendar-texts');
    const texts = (CALENDAR_TEXTS as Record<string, Record<string, unknown>>)[lang];
    if (texts && !(translate.translations[lang] as { calSync?: unknown } | undefined)?.calSync) {
      translate.setTranslation(lang, { calSync: texts }, true);
    }
  };
  translate.onLangChange.subscribe((e) => void apply(e.lang));
  translate.onTranslationChange.subscribe((e) => void apply(e.lang));
  started = Promise.all([apply('en'), apply(translate.currentLang || 'en')]).then(() => undefined);
  return started;
}
