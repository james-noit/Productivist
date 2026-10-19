import type { TranslateService } from '@ngx-translate/core';

let started: Promise<void> | null = null;

/**
 * Registers the Git forge strings (`src/i18n/forge-texts.ts`, a lazy chunk) with ngx-translate, merged into the loaded
 * messages, for English and for whatever language is active, and again whenever a language is switched or its messages
 * are (re)loaded (the app's own `setTranslation` replaces the whole language, which would drop them). Resolves once the
 * texts of the current language are in, so a lazy component can hold its first render until then instead of flashing
 * raw keys. Only lazy components call it.
 */
export function loadForgeTexts(translate: TranslateService): Promise<void> {
  if (started) return started;
  const apply = async (lang: string): Promise<void> => {
    const { FORGE_TEXTS } = await import('../i18n/forge-texts');
    const texts = (FORGE_TEXTS as Record<string, Record<string, unknown>>)[lang];
    // Other languages fall back to English through ngx-translate's default language.
    if (texts && !(translate.translations[lang] as { forge?: { err?: unknown } } | undefined)?.forge?.err) {
      translate.setTranslation(lang, { forge: texts }, true);
    }
  };
  translate.onLangChange.subscribe((e) => void apply(e.lang));
  translate.onTranslationChange.subscribe((e) => void apply(e.lang));
  started = Promise.all([apply('en'), apply(translate.currentLang || 'en')]).then(() => undefined);
  return started;
}
