import type { LocalizedText } from '../../types/sportask';
import { createRegistry } from './registry';

export interface SkinDef {
  id: string;
  name: LocalizedText;
  /** `theme`: no colours of its own, it follows the app's theme. */
  colorScheme: 'light' | 'dark' | 'theme';
  preview: [string, string, string];     // background, primary, accent
}

/** The skin that wears the app's own theme: no CSS block, no `data-sport-skin` on <html>, the surfaces use the theme tokens. */
export const APP_SKIN = 'app';

export const SKINS = createRegistry<SkinDef>([
  {
    id: APP_SKIN,
    name: { en: "Application's default", es: 'El de la aplicación' },
    colorScheme: 'theme',
    preview: ['var(--color-bg)', 'var(--color-primary)', 'var(--color-accent, var(--color-low))'],
  },
  { id: 'cyberpunk', name: { en: 'Cyberpunk', es: 'Cyberpunk' }, colorScheme: 'dark', preview: ['#151226', '#ee5a9a', '#5ad1d9'] },
  { id: 'powerYoga', name: { en: 'Power yoga', es: 'Power yoga' }, colorScheme: 'light', preview: ['#fbf4ea', '#c4572f', '#eaa13b'] },
]);

export const DEFAULT_SKIN = APP_SKIN;

/** The id a surface puts on its root: the chosen skin, or the default one when the stored id is not (or no longer) a skin we ship. */
export function resolveSkin(id: string): string {
  return SKINS.get(id) ? id : DEFAULT_SKIN;
}
