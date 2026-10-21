import type { LocalizedText } from '../../types/sportask';
import { createRegistry } from './registry';

export interface SkinDef {
  id: string;
  name: LocalizedText;
  colorScheme: 'light' | 'dark';
  preview: [string, string, string];     // background, primary, accent
}

export const SKINS = createRegistry<SkinDef>([
  { id: 'cyberpunk', name: { en: 'Cyberpunk', es: 'Cyberpunk' }, colorScheme: 'dark', preview: ['#0f0a1f', '#ff2e88', '#19e3ff'] },
  { id: 'powerYoga', name: { en: 'Power yoga', es: 'Power yoga' }, colorScheme: 'light', preview: ['#fbf4ea', '#c4572f', '#eaa13b'] },
]);

export const DEFAULT_SKIN = 'cyberpunk';

/** The id a surface puts on its root: the chosen skin, or the default one when the stored id is not (or no longer) a skin we ship. */
export function resolveSkin(id: string): string {
  return SKINS.get(id) ? id : DEFAULT_SKIN;
}
