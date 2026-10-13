/**
 * The bank of research findings behind the Multitask view's tip. Framework-free and imported only by
 * `multitask-view` (lazy), never by the initial bundle and never through the locale files.
 *
 * Rules for an entry: paraphrase the paper (no copied sentences), keep the wording plain and
 * non-alarmist, say "found" / "suggests" where the study does and don't claim causation it doesn't, and
 * only add it after checking authors, year, venue, DOI and the claim against the paper's abstract.
 */
export interface ResearchFinding {
  /** Stable slug, e.g. 'cowan-2001'. Stored in the "recently shown" list. */
  id: string;
  /** One or two sentences, paraphrased, at most 220 characters. */
  en: string;
  es: string;
  /** As cited: 'Rubinstein, Meyer & Evans'. */
  authors: string;
  year: number;
  /** Journal or proceedings. Not translated. */
  venue: string;
  /** Bare DOI; the link is `https://doi.org/<doi>`. */
  doi: string;
}

export const FINDINGS: readonly ResearchFinding[] = [
  {
    id: 'cowan-2001',
    en: 'Working memory seems to hold only about four chunks of information at once, so piling on more things tends to hurt focus rather than help it.',
    es: 'La memoria de trabajo parece retener solo unos cuatro bloques de información a la vez, así que acumular más cosas tiende a perjudicar el enfoque en vez de ayudarlo.',
    authors: 'Cowan',
    year: 2001,
    venue: 'Behavioral and Brain Sciences',
    doi: '10.1017/S0140525X01003922',
  },
  {
    id: 'rubinstein-2001',
    en: 'Every switch between tasks cost people time, and the cost was bigger when the tasks were more complex or less familiar.',
    es: 'Cada cambio entre tareas costaba tiempo, y el coste era mayor cuanto más complejas o menos familiares eran las tareas.',
    authors: 'Rubinstein, Meyer & Evans',
    year: 2001,
    venue: 'Journal of Experimental Psychology: Human Perception and Performance',
    doi: '10.1037/0096-1523.27.4.763',
  },
  {
    id: 'monsell-2003',
    en: 'Right after switching tasks, responses are slower and more error-prone. Preparing ahead reduces that cost, but it usually does not remove it.',
    es: 'Justo después de cambiar de tarea, las respuestas son más lentas y con más errores. Prepararse antes reduce ese coste, pero normalmente no lo elimina.',
    authors: 'Monsell',
    year: 2003,
    venue: 'Trends in Cognitive Sciences',
    doi: '10.1016/S1364-6613(03)00028-7',
  },
  {
    id: 'pashler-1994',
    en: 'Even with simple tasks, doing two at once is hard: choosing what to do next seems to be a bottleneck that deals with one task at a time.',
    es: 'Incluso con tareas sencillas cuesta hacer dos a la vez: elegir qué hacer a continuación parece un cuello de botella que atiende una tarea cada vez.',
    authors: 'Pashler',
    year: 1994,
    venue: 'Psychological Bulletin',
    doi: '10.1037/0033-2909.116.2.220',
  },
  {
    id: 'ophir-2009',
    en: 'In one study, people who often juggled several media streams were more distracted by irrelevant information and slower to switch between tasks.',
    es: 'En un estudio, quienes combinaban a menudo varios medios a la vez se distraían más con información irrelevante y tardaban más en cambiar de tarea.',
    authors: 'Ophir, Nass & Wagner',
    year: 2009,
    venue: 'PNAS',
    doi: '10.1073/pnas.0903620106',
  },
  {
    id: 'leroy-2009',
    en: 'Part of your mind can linger on a task you left unfinished. That “attention residue” was linked to worse performance on the next task.',
    es: 'Una parte de tu mente puede quedarse en una tarea sin terminar. Ese «residuo de atención» se asoció con peor rendimiento en la tarea siguiente.',
    authors: 'Leroy',
    year: 2009,
    venue: 'Organizational Behavior and Human Decision Processes',
    doi: '10.1016/j.obhdp.2009.04.002',
  },
  {
    id: 'mark-2008',
    en: 'Interrupted people finished their work faster to make up for the lost time, but they reported more stress, frustration, time pressure and effort.',
    es: 'Quienes eran interrumpidos terminaban antes para compensar el tiempo perdido, pero decían sentir más estrés, frustración, presión de tiempo y esfuerzo.',
    authors: 'Mark, Gudith & Klocke',
    year: 2008,
    venue: 'CHI ’08',
    doi: '10.1145/1357054.1357072',
  },
  {
    id: 'altmann-2014',
    en: 'Interruptions of only about three seconds roughly doubled the errors of losing one’s place in a multi-step task.',
    es: 'Interrupciones de apenas tres segundos duplicaron aproximadamente los errores por perder el hilo en una tarea de varios pasos.',
    authors: 'Altmann, Trafton & Hambrick',
    year: 2014,
    venue: 'Journal of Experimental Psychology: General',
    doi: '10.1037/a0030986',
  },
  {
    id: 'sanbonmatsu-2013',
    en: 'People who multitasked the most tended not to be the best at it, and many overrated their own ability.',
    es: 'Quienes más hacían varias cosas a la vez tendían a no ser los mejores haciéndolo, y muchos sobrestimaban su propia capacidad.',
    authors: 'Sanbonmatsu, Strayer, Medeiros-Ward & Watson',
    year: 2013,
    venue: 'PLoS ONE',
    doi: '10.1371/journal.pone.0054402',
  },
  {
    id: 'strayer-2001',
    en: 'In a driving simulator, talking on a phone, even hands-free, roughly doubled the signals drivers missed and slowed their reactions.',
    es: 'En un simulador de conducción, hablar por teléfono, incluso con manos libres, duplicó aproximadamente las señales que los conductores no vieron y ralentizó sus reacciones.',
    authors: 'Strayer & Johnston',
    year: 2001,
    venue: 'Psychological Science',
    doi: '10.1111/1467-9280.00386',
  },
  {
    id: 'foerde-2006',
    en: 'Learning while distracted still worked, but it leaned on habit-like memory, and the knowledge seemed harder to apply flexibly later.',
    es: 'Aprender con distracciones seguía funcionando, pero se apoyaba en una memoria de tipo hábito y el conocimiento parecía más difícil de aplicar con flexibilidad después.',
    authors: 'Foerde, Knowlton & Poldrack',
    year: 2006,
    venue: 'PNAS',
    doi: '10.1073/pnas.0602659103',
  },
  {
    id: 'madore-2020',
    en: 'Brief lapses of attention were linked to more forgetting, and people who media-multitask more tended to have more lapses and weaker memory.',
    es: 'Los breves lapsos de atención se asociaron con más olvidos, y quienes combinan más medios a la vez tendían a tener más lapsos y peor memoria.',
    authors: 'Madore et al.',
    year: 2020,
    venue: 'Nature',
    doi: '10.1038/s41586-020-2870-z',
  },
  {
    id: 'uncapher-2018',
    en: 'A review found heavy media multitaskers often score lower on attention-demanding tests, though many studies see no difference and cause and effect remain unclear.',
    es: 'Una revisión halló que quienes más combinan medios suelen puntuar peor en pruebas de atención, aunque muchos estudios no ven diferencia y la causa sigue sin estar clara.',
    authors: 'Uncapher & Wagner',
    year: 2018,
    venue: 'PNAS',
    doi: '10.1073/pnas.1611612115',
  },
];

/** A stable index for a calendar day ('YYYY-MM-DD'): the same day always gives the same finding. */
export function findingIndexForDay(isoDay: string, count: number): number {
  let hash = 2166136261;
  for (let i = 0; i < isoDay.length; i++) {
    hash ^= isoDay.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % count;
}
