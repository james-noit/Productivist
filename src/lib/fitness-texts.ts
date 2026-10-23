import type { TranslateService } from '@ngx-translate/core';

let started: Promise<void> | null = null;

/**
 * Registers the Fitness director's strings (`src/i18n/fitness-texts.ts`, a lazy chunk) with ngx-translate under the `fitness` key,
 * merged into the loaded messages, for English and for the active language, and again whenever a language is switched or its messages
 * are (re)loaded (the app's own `setTranslation` replaces the whole language, which would drop them). Resolves once the texts of the
 * current language are in, so the lazy view can hold its first render. Same pattern as `lib/forge-texts.ts`; only lazy code calls it.
 * Only `menu.fitness` (the menu entry) is in the locale files.
 */
export function loadFitnessTexts(translate: TranslateService): Promise<void> {
  if (started) return started;
  const apply = async (lang: string): Promise<void> => {
    const { FITNESS_TEXTS } = await import('../i18n/fitness-texts');
    const texts = (FITNESS_TEXTS as Record<string, Record<string, unknown>>)[lang];
    // Other languages fall back to English through ngx-translate's default language.
    if (texts && !(translate.translations[lang] as { fitness?: { title?: unknown } } | undefined)?.fitness?.title) {
      translate.setTranslation(lang, { fitness: texts }, true);
    }
  };
  translate.onLangChange.subscribe((e) => void apply(e.lang));
  translate.onTranslationChange.subscribe((e) => void apply(e.lang));
  started = Promise.all([apply('en'), apply(translate.currentLang || 'en')]).then(() => undefined);
  return started;
}
