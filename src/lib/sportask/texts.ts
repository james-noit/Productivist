import type { TranslateService } from '@ngx-translate/core';
import type { LocalizedText } from '../../types/sportask';

let started: Promise<void> | null = null;

/**
 * Registers Sportask's UI strings (`src/i18n/sportask-texts.ts`, a lazy chunk) with ngx-translate under the `sportask`
 * key, merged into the loaded messages, for English and for whatever language is active, and again whenever a language
 * is switched or its messages are (re)loaded (the app's own `setTranslation` replaces the whole language, which would
 * drop them). Resolves once the texts of the current language are in, so a lazy component can hold its first render
 * until then instead of flashing raw keys. It also applies the cached catalog overlay (see `overlay/store.ts`). Same pattern as `lib/forge-texts.ts`; only lazy components call it.
 */
export function loadSportaskTexts(translate: TranslateService): Promise<void> {
  if (started) return started;
  const apply = async (lang: string): Promise<void> => {
    const { SPORTASK_TEXTS } = await import('../../i18n/sportask-texts');
    const texts = (SPORTASK_TEXTS as Record<string, Record<string, unknown>>)[lang];
    // Other languages fall back to English through ngx-translate's default language.
    if (texts && !(translate.translations[lang] as { sportask?: { goal?: unknown } } | undefined)?.sportask?.goal) {
      translate.setTranslation(lang, { sportask: texts }, true);
    }
  };
  translate.onLangChange.subscribe((e) => void apply(e.lang));
  translate.onTranslationChange.subscribe((e) => void apply(e.lang));
  // The Fitness director's published catalog (docs/sportask/DIRECTOR.md): the cached overlay is applied before any component renders
  // its first frame; the revalidation runs in the background. A dynamic import, so lazy callers that only need the texts stay small.
  const overlay = import('./overlay/store').then((m) => m.ensureOverlay()).catch(() => undefined);
  started = Promise.all([apply('en'), apply(translate.currentLang || 'en'), overlay]).then(() => undefined);
  return started;
}

/** A catalog text in the given language, falling back to English (and to an empty string for a missing text). */
export function localize(text: LocalizedText | undefined, lang: string): string {
  if (!text) return '';
  return (lang === 'es' ? text.es : text.en) || text.en;
}
