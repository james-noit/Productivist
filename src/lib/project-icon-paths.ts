/**
 * Project icons as data: each icon is a few `d` strings on a 24px grid, drawn with the same
 * stroke style as `ui-icon` (the `icon` component sets the stroke, so every path is an open or
 * closed outline, never a fill). Lazy on purpose: names, groups and labels live here and not in
 * `en.json`, so the initial bundle does not pay for ~50 icons. Never rename or remove a name:
 * it is the value stored on the project (an unknown value, such as an old emoji, is printed as text).
 */
export type ProjectIconName =
  | 'folder'
  | 'briefcase'
  | 'target'
  | 'pin'
  | 'rocket'
  | 'chart'
  | 'presentation'
  | 'calendar'
  | 'tool'
  | 'building'
  | 'code'
  | 'terminal'
  | 'server'
  | 'cpu'
  | 'bug'
  | 'package'
  | 'palette'
  | 'pen'
  | 'camera'
  | 'music'
  | 'film'
  | 'mic'
  | 'book'
  | 'flask'
  | 'graduation'
  | 'lightbulb'
  | 'puzzle'
  | 'globe'
  | 'home'
  | 'heart'
  | 'sprout'
  | 'lotus'
  | 'baby'
  | 'paw'
  | 'coffee'
  | 'dumbbell'
  | 'run'
  | 'apple'
  | 'moon'
  | 'wallet'
  | 'coins'
  | 'cart'
  | 'receipt'
  | 'plane'
  | 'map'
  | 'mountain'
  | 'bike'
  | 'car'
  | 'flame';

export const PROJECT_ICON_PATHS: Record<string, readonly string[]> = {
  folder: ['M3 6.5a1.5 1.5 0 0 1 1.5-1.5h4l1.5 2h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z'],
  briefcase: ['M4.8 8h14.4a1.8 1.8 0 0 1 1.8 1.8v7.4a1.8 1.8 0 0 1 -1.8 1.8h-14.4a1.8 1.8 0 0 1 -1.8 -1.8v-7.4a1.8 1.8 0 0 1 1.8 -1.8z', 'M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M3 13.2h18'],
  target: ['M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0', 'M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0', 'M11.3 12a0.7 0.7 0 1 0 1.4 0a0.7 0.7 0 1 0 -1.4 0'],
  pin: ['M12 21.5s-6.5-6-6.5-11.5a6.5 6.5 0 0 1 13 0C18.5 15.5 12 21.5 12 21.5z', 'M9.7 10a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0'],
  rocket: ['M12 2.5c2.6 1.8 4 4.8 4 8.5 0 2-.5 3.6-1 5l-3 3-3-3c-.5-1.4-1-3-1-5 0-3.7 1.4-6.7 4-8.5z', 'M10.5 9.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0', 'M8.5 14.5l-3 1.8 1-4M15.5 14.5l3 1.8-1-4', 'M12 20.5v1.5'],
  chart: ['M4 4v16h16', 'M8 15l3.5-4.5 3 2.5L19.5 7', 'M16 7h3.5v3.5'],
  presentation: ['M3 4h18', 'M5 4v11h14V4', 'M12 15v3', 'M8.5 21L12 18l3.5 3', 'M8.5 12l2.5-2.5 2 1.5 3-3'],
  calendar: ['M6 5.5h12a2 2 0 0 1 2 2v11a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2z', 'M4 10h16', 'M8.5 3.5v4M15.5 3.5v4'],
  tool: ['M14.7 6.3a4 4 0 0 0-5.03 5.03L4.5 16.5l3 3 5.17-5.17a4 4 0 0 0 5.03-5.03l-2.3 2.3-2-2z'],
  building: ['M6 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1z', 'M16 9h3a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-10a1 1 0 0 1 1 -1z', 'M8 7.5h2M8 11.5h2M8 15.5h2', 'M17.5 13h.01M17.5 17h.01'],
  code: ['M8.5 7L3.5 12l5 5', 'M15.5 7l5 5-5 5', 'M13.5 4.5l-3 15'],
  terminal: ['M5 4.5h14a2 2 0 0 1 2 2v11a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2z', 'M7 9.5l3 2.5-3 2.5', 'M12.5 15h4.5'],
  server: ['M5.5 4h13a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1 -1.5 1.5h-13a1.5 1.5 0 0 1 -1.5 -1.5v-3.5a1.5 1.5 0 0 1 1.5 -1.5z', 'M5.5 13.5h13a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1 -1.5 1.5h-13a1.5 1.5 0 0 1 -1.5 -1.5v-3.5a1.5 1.5 0 0 1 1.5 -1.5z', 'M8 7.25h.01M8 16.75h.01', 'M13 7.25h4M13 16.75h4'],
  cpu: ['M8.5 7h7a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1 -1.5 1.5h-7a1.5 1.5 0 0 1 -1.5 -1.5v-7a1.5 1.5 0 0 1 1.5 -1.5z', 'M10.5 10h3a0.5 0.5 0 0 1 0.5 0.5v3a0.5 0.5 0 0 1 -0.5 0.5h-3a0.5 0.5 0 0 1 -0.5 -0.5v-3a0.5 0.5 0 0 1 0.5 -0.5z', 'M9.5 3.5v3.5M14.5 3.5v3.5M9.5 17v3.5M14.5 17v3.5M3.5 9.5H7M3.5 14.5H7M17 9.5h3.5M17 14.5h3.5'],
  bug: ['M8 11a4 4 0 0 1 8 0v4a4 4 0 0 1-8 0z', 'M10 7.2L8.5 4.5M14 7.2l1.5-2.7', 'M8 11H4.5M8 15H4.5M16 11h3.5M16 15h3.5', 'M12 7.5V19'],
  package: ['M12 3l8 4v10l-8 4-8-4V7z', 'M4 7l8 4 8-4', 'M12 11v10', 'M8 5l8 4'],
  palette: ['M12 3a9 8 0 1 0 0 16c1 0 1.6-.6 1.6-1.4 0-.4-.15-.7-.4-1-.25-.3-.4-.6-.4-1 0-.8.6-1.4 1.4-1.4H16a4 4 0 0 0 4-4C20 5.7 16.4 3 12 3z', 'M7.3 10a0.7 0.7 0 1 0 1.4 0a0.7 0.7 0 1 0 -1.4 0', 'M10.3 7.3a0.7 0.7 0 1 0 1.4 0a0.7 0.7 0 1 0 -1.4 0', 'M14.3 8a0.7 0.7 0 1 0 1.4 0a0.7 0.7 0 1 0 -1.4 0', 'M8.3 14a0.7 0.7 0 1 0 1.4 0a0.7 0.7 0 1 0 -1.4 0'],
  pen: ['M4.5 19.5l.9-4.2L16.1 4.6a2 2 0 0 1 2.8 0l.5.5a2 2 0 0 1 0 2.8L8.7 18.6z', 'M14.5 6.3l3.2 3.2'],
  camera: ['M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.5-2.5h7L17 7h2.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z', 'M8.5 13a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0'],
  music: ['M9 17.5V6.5l10-2v11', 'M4 17.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0', 'M14 15.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0'],
  film: ['M5.5 4h13a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-13a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z', 'M8 4v16M16 4v16', 'M3.5 9H8M3.5 15H8M16 9h4.5M16 15h4.5'],
  mic: ['M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5V21M9 21h6'],
  book: ['M12 5.5c-1.5-1-4-1.5-6-1.2v13c2-.3 4.5.2 6 1.2 1.5-1 4-1.5 6-1.2v-13c-2-.3-4.5.2-6 1.2z', 'M12 5.5v13'],
  flask: ['M10 2h4M10 2v6l-5.5 9.5A1.8 1.8 0 0 0 6 20.5h12a1.8 1.8 0 0 0 1.5-3L14 8V2', 'M7 15h10'],
  graduation: ['M2.5 9.5L12 5l9.5 4.5L12 14z', 'M6.5 11.8V16c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.2', 'M21.5 9.5V15'],
  lightbulb: ['M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.2 1.1 2.1V17h5v-1.1c0-.9.4-1.6 1.1-2.1A6 6 0 0 0 12 3z', 'M10 20.5h4'],
  puzzle: ['M4.5 7h4a2 2 0 1 1 4 0h5v4a2 2 0 1 1 0 4v4h-13z'],
  globe: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M12 3a4 9 0 1 0 0 18 4 9 0 1 0 0-18z', 'M3.3 9h17.4M3.3 15h17.4'],
  home: ['M3.5 11L12 4l8.5 7', 'M5.5 9.5V20h13V9.5', 'M10 20v-5.5h4V20'],
  heart: ['M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20z'],
  sprout: ['M12 21v-9', 'M12 12c-4 0-7-3-7-7 4 0 7 3 7 7z', 'M12 12c4 0 7-3 7-7-4 0-7 3-7 7z', 'M8.5 21h7'],
  lotus: ['M12 5c2 2 2.8 4.4 2.8 7S13.6 17 12 19c-1.6-2-2.8-4.4-2.8-7S10 7 12 5z', 'M9.6 17.6C6.3 17 3.8 14.2 3.5 10.5c3.2.2 5.4 1.6 6.2 3.8', 'M14.4 17.6c3.3-.6 5.8-3.4 6.1-7.1-3.2.2-5.4 1.6-6.2 3.8', 'M7 20.5h10'],
  baby: ['M3.5 12.5a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0', 'M9.5 11.5h.01M14.5 11.5h.01', 'M9.7 15a3.4 2.6 0 0 0 4.6 0', 'M11 4.2c.2-1.3 2.6-1.6 3 0'],
  paw: ['M12 12.5c-3 0-5 2.5-5 4.8 0 1.8 1.5 2.7 3 2.7 1 0 1.3-.5 2-.5s1 .5 2 .5c1.5 0 3-.9 3-2.7 0-2.3-2-4.8-5-4.8z', 'M3.8 10.5a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0', 'M7.2 6.3a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0', 'M13.2 6.3a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0', 'M16.8 10.5a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0'],
  coffee: ['M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z', 'M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16', 'M8.5 3.5c-.8 1.2.8 2 0 3.5M12.5 3.5c-.8 1.2.8 2 0 3.5'],
  dumbbell: ['M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11'],
  run: ['M13.2 4.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0', 'M14 8.5l-2.5 5', 'M11.5 13.5l3.5 2.5-1 4.5', 'M11.5 13.5l-3.5 1.5-3 3.5', 'M14 8.5l3.5 2 3-.5', 'M13.5 9L9 10l-2.5 3'],
  apple: ['M12 8c-1.5-1.3-4.7-2-6.7 1-1.6 2.4-.7 6.5 1.2 9 1.2 1.6 2.6 2.2 3.5 1.8.8-.4 1.2-.4 2 0 .9.4 2.3-.2 3.5-1.8 1.9-2.5 2.8-6.6 1.2-9-2-3-5.2-2.3-6.7-1z', 'M12 8c0-2 1-3.5 3-4'],
  moon: ['M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z'],
  wallet: ['M3.5 9a2.5 2.5 0 0 1 2.5-2.5h11V9', 'M3.5 9v8a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6.5a1.5 1.5 0 0 0-1.5-1.5z', 'M16.5 14h.01'],
  coins: ['M4 15a5 5 0 1 0 10 0a5 5 0 1 0 -10 0', 'M10.13 10.13A5 5 0 1 1 13.87 13.87', 'M9 13v4'],
  cart: ['M3 4h2.5l2 11h10.5l2-8H6.3', 'M7.7 19.5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0', 'M15.7 19.5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0'],
  receipt: ['M6 3.5h12v17l-2.2-1.5-1.9 1.5-1.9-1.5-1.9 1.5L8.2 19 6 20.5z', 'M9 8h6M9 11.5h6M9 15h3'],
  plane: ['M12 3c1 0 1.7 1.2 1.7 3v4.5L21 15v2l-7.3-2-.4 3.5 2.2 1.5V21L12 20l-3.5 1v-1l2.2-1.5-.4-3.5L3 17v-2l7.3-4.5V6c0-1.8.7-3 1.7-3z'],
  map: ['M3.5 6.5L9 4.5l6 2.5 5.5-2v13L15 20l-6-2.5-5.5 2z', 'M9 4.5v13M15 7v13'],
  mountain: ['M3 19.5L9.5 8l4 7 2.5-4 5 8.5z', 'M7.8 11.5l1.7 1.3 1.6-1.3'],
  bike: ['M2.5 16a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0', 'M14.5 16a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0', 'M6 16l3.5-7h6L12 16zM15.5 9L18 16', 'M8 9h3M14.5 6.5h2.5l-1.5 2.5'],
  car: ['M3.5 12.5l1.8-4.8A2 2 0 0 1 7.2 6.5h9.6a2 2 0 0 1 1.9 1.2l1.8 4.8v5h-17z', 'M3.5 12.5h17', 'M5.9 17.5a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0', 'M14.9 17.5a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0'],
  flame: ['M12 2c1 3-2 4-2 7a2 2 0 1 0 4 0c0-1-.5-1.5-.5-1.5 2 1 4 4 4 7a6 6 0 1 1-12 0c0-4 2-6 3-8 1-2 2.5-3 3.5-4.5z'],
  'folder-open': ['M3 7.5V6a1.5 1.5 0 0 1 1.5-1.5h4l1.5 2h6.5A1.5 1.5 0 0 1 18 8v.2', 'M2.3 8.7a1 1 0 0 1 1-.2h16.4a1 1 0 0 1 .98 1.22l-1.4 6A1.6 1.6 0 0 1 17.7 17H5.3a1.6 1.6 0 0 1-1.56-1.28l-1.4-6a1 1 0 0 1 0-1.02z'],
  inbox: ['M3 13l3-8.5A1.5 1.5 0 0 1 7.4 3.5h9.2a1.5 1.5 0 0 1 1.4 1L21 13v5.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z', 'M3 13h5.2a1 1 0 0 1 .9.55l.5 1a2 2 0 0 0 1.8 1.1h1.2a2 2 0 0 0 1.8-1.1l.5-1a1 1 0 0 1 .9-.55H21'],
};

export interface ProjectIconGroup {
  key: string;
  en: string;
  es: string;
  icons: ProjectIconName[];
}

export const PROJECT_ICON_GROUPS: ProjectIconGroup[] = [
  { key: 'work', en: 'Work', es: 'Trabajo', icons: ['folder', 'briefcase', 'target', 'pin', 'rocket', 'chart', 'presentation', 'calendar'] },
  { key: 'build', en: 'Build', es: 'Desarrollo', icons: ['tool', 'building', 'code', 'terminal', 'server', 'cpu', 'bug', 'package'] },
  { key: 'creative', en: 'Creative', es: 'Creatividad', icons: ['palette', 'pen', 'camera', 'music', 'film', 'mic'] },
  { key: 'learning', en: 'Learning', es: 'Aprendizaje', icons: ['book', 'flask', 'graduation', 'lightbulb', 'puzzle', 'globe'] },
  { key: 'life', en: 'Home & life', es: 'Hogar y vida', icons: ['home', 'heart', 'sprout', 'lotus', 'baby', 'paw', 'coffee'] },
  { key: 'health', en: 'Health', es: 'Salud', icons: ['dumbbell', 'run', 'apple', 'moon'] },
  { key: 'money', en: 'Money', es: 'Dinero', icons: ['wallet', 'coins', 'cart', 'receipt'] },
  { key: 'travel', en: 'Travel & outdoors', es: 'Viajes y aire libre', icons: ['plane', 'map', 'mountain', 'bike', 'car', 'flame'] },
];

/** Names for `aria-label`/`title` and for the picker's search. */
export const PROJECT_ICON_LABELS: Record<string, { en: string; es: string }> = {
  folder: { en: 'Folder', es: 'Carpeta' },
  briefcase: { en: 'Briefcase', es: 'Maletín' },
  target: { en: 'Target', es: 'Objetivo' },
  pin: { en: 'Pin', es: 'Ubicación' },
  rocket: { en: 'Rocket', es: 'Cohete' },
  chart: { en: 'Chart', es: 'Gráfico' },
  presentation: { en: 'Presentation', es: 'Presentación' },
  calendar: { en: 'Calendar', es: 'Calendario' },
  tool: { en: 'Tools', es: 'Herramientas' },
  building: { en: 'Building', es: 'Edificio' },
  code: { en: 'Code', es: 'Código' },
  terminal: { en: 'Terminal', es: 'Terminal' },
  server: { en: 'Server', es: 'Servidor' },
  cpu: { en: 'Chip', es: 'Chip' },
  bug: { en: 'Bug', es: 'Error' },
  package: { en: 'Package', es: 'Paquete' },
  palette: { en: 'Palette', es: 'Paleta' },
  pen: { en: 'Pencil', es: 'Lápiz' },
  camera: { en: 'Camera', es: 'Cámara' },
  music: { en: 'Music', es: 'Música' },
  film: { en: 'Film', es: 'Cine' },
  mic: { en: 'Microphone', es: 'Micrófono' },
  book: { en: 'Book', es: 'Libro' },
  flask: { en: 'Flask', es: 'Laboratorio' },
  graduation: { en: 'Graduation', es: 'Graduación' },
  lightbulb: { en: 'Idea', es: 'Idea' },
  puzzle: { en: 'Puzzle', es: 'Puzle' },
  globe: { en: 'Globe', es: 'Mundo' },
  home: { en: 'Home', es: 'Casa' },
  heart: { en: 'Heart', es: 'Corazón' },
  sprout: { en: 'Sprout', es: 'Brote' },
  lotus: { en: 'Lotus', es: 'Loto' },
  baby: { en: 'Baby', es: 'Bebé' },
  paw: { en: 'Pet', es: 'Mascota' },
  coffee: { en: 'Coffee', es: 'Café' },
  dumbbell: { en: 'Gym', es: 'Gimnasio' },
  run: { en: 'Running', es: 'Correr' },
  apple: { en: 'Apple', es: 'Manzana' },
  moon: { en: 'Sleep', es: 'Sueño' },
  wallet: { en: 'Wallet', es: 'Cartera' },
  coins: { en: 'Coins', es: 'Monedas' },
  cart: { en: 'Cart', es: 'Compras' },
  receipt: { en: 'Receipt', es: 'Recibo' },
  plane: { en: 'Plane', es: 'Avión' },
  map: { en: 'Map', es: 'Mapa' },
  mountain: { en: 'Mountain', es: 'Montaña' },
  bike: { en: 'Bike', es: 'Bicicleta' },
  car: { en: 'Car', es: 'Coche' },
  flame: { en: 'Flame', es: 'Llama' },
};

/** The flat list, in group order. */
export const PROJECT_ICONS: ProjectIconName[] = PROJECT_ICON_GROUPS.flatMap((group) => group.icons);

/** The first dozen, for the compact inline "new project" form. */
export const QUICK_PROJECT_ICONS: ProjectIconName[] = [
  'folder', 'pin', 'rocket', 'target', 'book', 'briefcase', 'tool', 'palette', 'flask', 'building', 'sprout', 'flame',
];
