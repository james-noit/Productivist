// Fails when a project presentation (or the Flow-only code) leaked into the initial bundle.
//
// Each presentation of the project detail view sits in its own `@defer (on immediate)` block so its code
// loads the first time its tab opens, never before. Anything that imports one of those components from
// outside a @defer pulls it back into the initial chunk, which is easy to do by accident and invisible
// until the bundle budget trips. Run after a build made with `--stats-json` (`npm run check:lazy` does
// both); pass another stats file as the first argument.
import { readFileSync } from 'node:fs';

const statsPath = process.argv[2] ?? 'dist/productivist/stats.json';
const { outputs } = JSON.parse(readFileSync(statsPath, 'utf8'));

const component = (name) => `src/app/components/${name}/${name}.component.ts`;

/** Components that must live in their own lazy chunk. */
const PRESENTATIONS = [
  'project-overview',
  'kanban-board',
  'project-task-list',
  'eisenhower-view',
  'project-roadmap',
  'project-calendar',
  'project-flow',
].map(component);

/** Code only the Flow presentation may use: it must not appear in any chunk that does not hold project-flow. */
const FLOW_ONLY = [
  component('flow-canvas'),
  component('flow-objective-node'),
  component('flow-milestone-node'),
  component('objective-modal'),
  component('flow-outline'),
  component('flow-link-menu'),
  component('flow-selection-bar'),
  component('flow-filter-drawer'),
  'src/app/components/project-flow/flow-view-state.ts',
  'src/lib/flow-layout.ts',
  'src/lib/flow-geometry.ts',
];

/**
 * Shared by several lazy chunks (the Flow view, the Overview's Objectives card, the 🎯 chips of Kanban and
 * List), so they may live in a shared chunk, but never in an initial one.
 */
const NEVER_INITIAL = ['src/lib/flow-graph.ts', component('objective-chip')];

/**
 * The recurring-tasks modal (rendered by AppComponent behind `@defer`) and the rule form it shares with Task
 * Details, plus the text side of recurrences (rule summaries, weekday names, previews). `RecurrenceService` and
 * `lib/recurrence.ts` are deliberately in the initial bundle, these are not. The Tasks and projects page (and
 * the pieces only it uses: cards, rows, drawer, floating button, inbox, kebab menu, page maths) and the shared form widgets stay out of it too.
 */
const NEVER_INITIAL_UI = [
  'src/lib/multitask-research.ts',
  'src/lib/bell-sounds.ts',
  component('lot-editor'),
  component('alarm-modal'),
  component('task-picker'),
  component('recurring-tasks-modal'),
  component('recurrence-editor'),
  'src/lib/recurrence-format.ts',
  'src/services/recurrence-format.service.ts',
  component('projects-view'),
  component('projects-dashboard'),
  component('project-card'),
  component('project-row'),
  component('project-actions-menu'),
  component('project-task-rows'),
  component('projects-filter-drawer'),
  component('fab-menu'),
  component('side-drawer'),
  'src/lib/scroll-lock.ts',
  'src/app/components/projects-view/projects-page.state.ts',
  component('inbox-card'),
  component('kebab-menu'),
  component('ui-icon'),
  component('tag-input'),
  component('number-stepper'),
  component('task-detail-modal'),
  'src/lib/project-cards.ts',
  'src/lib/project-icon-paths.ts',
  component('plan-objectives-step'),
];

const inputsOf = (output) => Object.keys(output.inputs ?? {});
const names = Object.keys(outputs).filter((name) => name.endsWith('.js'));

// The initial bundle: the entry point plus everything it imports statically, transitively.
const entry = names.find((name) => outputs[name].entryPoint?.endsWith('src/main.ts'));
if (!entry) {
  console.error(`check-lazy-chunks: no main.ts entry point in ${statsPath}. Was the build made with --stats-json?`);
  process.exit(2);
}
const initial = new Set([entry]);
for (const queue = [entry]; queue.length; ) {
  for (const imported of outputs[queue.pop()].imports ?? []) {
    if (imported.kind === 'import-statement' && outputs[imported.path] && !initial.has(imported.path)) {
      initial.add(imported.path);
      queue.push(imported.path);
    }
  }
}

const problems = [];
for (const name of initial) {
  const inputs = inputsOf(outputs[name]);
  for (const file of [...PRESENTATIONS, ...FLOW_ONLY, ...NEVER_INITIAL, ...NEVER_INITIAL_UI]) {
    if (inputs.includes(file)) problems.push(`${file} is in the initial chunk ${name}`);
  }
}
for (const name of names) {
  const inputs = inputsOf(outputs[name]);
  if (inputs.includes(component('project-flow'))) continue;
  for (const file of FLOW_ONLY) {
    if (inputs.includes(file) && !initial.has(name)) problems.push(`${file} is in ${name}, outside the project-flow chunk`);
  }
}
// Every presentation must exist as a chunk of its own (a missing one means the check is looking at the wrong files).
for (const file of PRESENTATIONS) {
  if (!names.some((name) => inputsOf(outputs[name]).includes(file))) problems.push(`${file} is in no chunk at all (renamed?)`);
}

if (problems.length) {
  console.error('Lazy chunk check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`Lazy chunk check passed: ${PRESENTATIONS.length} presentations stay out of the ${initial.size} initial chunks.`);
