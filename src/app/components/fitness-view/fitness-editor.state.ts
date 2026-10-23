import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { ApiError } from '../../../core/api';
import { loadFitnessTexts } from '../../../lib/fitness-texts';
import { contentFor } from '../../../lib/sportask/overlay/merge';
import { entryOf, keepPublished, putEntry, removeEntry, sameOverlay } from '../../../lib/sportask/overlay/edit';
import { sanitizeOverlayReport } from '../../../lib/sportask/overlay/sanitize-overlay';
import { smokeTest } from '../../../lib/sportask/overlay/smoke';
import { refreshOverlay } from '../../../lib/sportask/overlay/store';
import { type CatalogOverlay, type EntryOf, type Section, emptyOverlay } from '../../../lib/sportask/overlay/types';
import { type Issue, errorsOf, validateOverlay } from '../../../lib/sportask/overlay/validate';
import { loadSportaskTexts, localize } from '../../../lib/sportask/texts';
import type { LocalizedText } from '../../../types/sportask';
import { FitnessService } from '../../../services/fitness.service';
import { SettingsService } from '../../../services/settings.service';

export type FitnessTab = 'exercises' | 'ladders' | 'programs' | 'templates' | 'timings' | 'assessments' | 'equipment' | 'preview' | 'checks' | 'versions';
export const FITNESS_TABS: readonly FitnessTab[] = ['exercises', 'ladders', 'programs', 'templates', 'timings', 'assessments', 'equipment', 'preview', 'checks', 'versions'];

/** Which tab edits which section of the document (the Programs tab edits `goals`, Timings edits `cadences`). */
export const TAB_OF_SECTION: Record<Section | 'sweep' | 'general', FitnessTab> = {
  exercises: 'exercises',
  ladders: 'ladders',
  goals: 'programs',
  templates: 'templates',
  cadences: 'timings',
  assessments: 'assessments',
  equipment: 'equipment',
  sweep: 'checks',
  general: 'checks',
};

export type Busy = 'loading' | 'saving' | 'publishing' | 'restoring' | 'checking' | null;
export type Notice = { kind: 'saved' | 'published' | 'restored' | 'conflict' | 'unchanged' | 'refused' | 'error' | 'checksFailed'; version?: number } | null;

/**
 * What the Fitness director's tabs share: the draft (a catalog overlay, docs/sportask/DIRECTOR.md), the last saved copy of it, the
 * published head, the validation of the draft and the saving, publishing and restoring. A plain `@Injectable()` listed in
 * `FitnessViewComponent`'s `providers`, so it is lazy and dies with the view (never a root service).
 */
@Injectable()
export class FitnessEditorState {
  private readonly api = inject(FitnessService);
  private readonly translate = inject(TranslateService);
  private readonly appSettings = inject(SettingsService);

  readonly ready = signal(false);
  readonly lang = this.appSettings.language;
  /** Bumped when the translations (re)load, so labels built in a `computed` follow a language switch. */
  private readonly texts = signal(0);

  private readonly storedTab = localStorageSignal<string>('productivist.fitnessTab', 'exercises');
  readonly tab = computed<FitnessTab>(() => FITNESS_TABS.find((t) => t === this.storedTab()) ?? 'exercises');
  private readonly selection = signal<Partial<Record<FitnessTab, string>>>({});

  /** The draft being edited, the last copy saved on the server, and the published head. */
  readonly overlay = signal<CatalogOverlay>(emptyOverlay());
  readonly baseline = signal<CatalogOverlay>(emptyOverlay());
  readonly published = signal<{ version: number; overlay: CatalogOverlay } | null>(null);
  readonly revision = signal(0);
  readonly baseVersion = signal(0);
  readonly updatedBy = signal<string | null>(null);
  readonly updatedAt = signal<string | null>(null);
  /** The version this draft restores, so that publishing it is recorded as a rollback. */
  readonly rollbackOf = signal<number | null>(null);

  readonly busy = signal<Busy>(null);
  readonly loadError = signal<'network' | 'forbidden' | null>(null);
  readonly notice = signal<Notice>(null);
  /** What the sanitiser had to leave out of the loaded document (a hand-edited draft): saving would lose it. */
  readonly dropped = signal<string[]>([]);

  readonly dirty = computed(() => !sameOverlay(this.overlay(), this.baseline()));
  /** The draft differs from what is published. */
  readonly unpublished = computed(() => !sameOverlay(this.overlay(), this.published()?.overlay ?? emptyOverlay()));

  /** The built-in catalog with the draft layered over it: what the editors list and the preview runs on. */
  readonly content = computed(() => contentFor(this.overlay()));
  /** Structural validation of the draft (fast; recomputed on every edit). */
  readonly issues = computed<Issue[]>(() => validateOverlay(this.overlay(), { published: this.published()?.overlay ?? null }));
  readonly errors = computed(() => errorsOf(this.issues()));
  readonly warnings = computed(() => this.issues().filter((i) => i.severity === 'warning'));
  /** The generation sweep, valid while the draft is the one it ran on. */
  private readonly sweepResult = signal<{ key: string; runs: number; issues: Issue[]; at: number } | null>(null);
  readonly sweep = computed(() => {
    const r = this.sweepResult();
    return r && r.key === JSON.stringify(this.overlay()) ? r : null;
  });
  readonly nextVersion = computed(() => (this.published()?.version ?? 0) + 1);

  constructor() {
    const bump = (): void => this.texts.update((n) => n + 1);
    this.translate.onLangChange.subscribe(bump);
    this.translate.onTranslationChange.subscribe(bump);
    void Promise.all([loadFitnessTexts(this.translate), loadSportaskTexts(this.translate)]).then(() => {
      bump();
      this.ready.set(true);
      void this.load();
    });
  }

  // ---- text helpers

  /** A `fitness.*` string, re-read when the language or the loaded texts change. */
  t(key: string, params?: Record<string, unknown>): string {
    this.texts();
    this.lang();
    return this.translate.instant(`fitness.${key}`, params);
  }

  /** A `sportask.*` string (the labels of patterns, zones and formats are shared with the Sportask panel). */
  s(key: string, params?: Record<string, unknown>): string {
    this.texts();
    this.lang();
    return this.translate.instant(`sportask.${key}`, params);
  }

  /** The message of an issue: `fitness.issue.<code>` with its parameters, the field named in the user's language. */
  issueText(issue: Issue): string {
    const params: Record<string, unknown> = { ...(issue.params ?? {}) };
    const field = params['field'];
    if (typeof field === 'string') {
      const numbered = /^(cue|phase) (\d+)( note)?$/.exec(field);
      const key = numbered ? numbered[1] + (numbered[3] ? 'Note' : '') : field;
      const label = this.t(`field.${key}`);
      params['field'] = label.startsWith('fitness.field.') ? field : numbered ? `${label} ${numbered[2]}` : label;
    }
    const key = params['key'];
    if (issue.code.startsWith('param') && typeof key === 'string') {
      const label = this.t(`param.${key}`);
      if (!label.startsWith('fitness.param.')) params['key'] = label;
    }
    return this.t(`issue.${issue.code}`, params);
  }

  loc(text: LocalizedText | undefined): string {
    return localize(text, this.lang());
  }

  when(iso: string | null | undefined): string {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(this.lang(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  // ---- navigation

  selectTab(tab: FitnessTab): void {
    this.storedTab.set(tab);
  }

  selected(tab: FitnessTab): string | null {
    return this.selection()[tab] ?? null;
  }

  select(tab: FitnessTab, id: string | null): void {
    this.selection.update((s) => {
      const { [tab]: _old, ...rest } = s;
      return id === null ? rest : { ...rest, [tab]: id };
    });
  }

  /** Jumps to the thing an issue is about. */
  goTo(issue: Issue): void {
    const tab = TAB_OF_SECTION[issue.section];
    this.selectTab(tab);
    if (!issue.id || tab === 'checks') return;
    // A program is listed as `goal/program`; an issue about a goal alone opens the goal's first program.
    const programKey = tab === 'programs' && !issue.id.includes('/') ? `${issue.id}/${this.content().goals.get(issue.id)?.programs[0]?.id ?? ''}` : issue.id;
    this.select(tab, programKey);
  }

  // ---- editing

  entry<S extends Section>(section: S, id: string): EntryOf<S> | undefined {
    return entryOf(this.overlay(), section, id);
  }

  setEntry<S extends Section>(section: S, entry: EntryOf<S>): void {
    this.overlay.update((o) => putEntry(o, section, entry));
    this.notice.set(null);
  }

  clearEntry(section: Section, id: string): void {
    this.overlay.update((o) => removeEntry(o, section, id));
    this.notice.set(null);
  }

  // ---- server

  async load(): Promise<void> {
    this.busy.set('loading');
    this.loadError.set(null);
    try {
      const [draft, head] = await Promise.all([this.api.draft(), this.api.published()]);
      const loaded = sanitizeOverlayReport(draft.document);
      const published = sanitizeOverlayReport(head.document).overlay;
      this.overlay.set(loaded.overlay);
      this.baseline.set(loaded.overlay);
      this.dropped.set(loaded.dropped);
      this.published.set(head.version > 0 ? { version: head.version, overlay: published } : null);
      this.revision.set(draft.revision);
      this.baseVersion.set(draft.baseVersion);
      this.updatedBy.set(draft.updatedBy);
      this.updatedAt.set(draft.updatedAt);
      this.rollbackOf.set(null);
      this.notice.set(null);
    } catch (error) {
      this.loadError.set(error instanceof ApiError && (error.status === 403 || error.status === 401) ? 'forbidden' : 'network');
    } finally {
      this.busy.set(null);
    }
  }

  /** Saves the draft. Resolves true when it is saved. */
  async save(): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set('saving');
    try {
      const saved = await this.api.saveDraft(this.overlay(), this.revision());
      this.baseline.set(this.overlay());
      this.revision.set(saved.revision);
      this.updatedAt.set(saved.updatedAt);
      this.dropped.set([]);
      this.notice.set({ kind: 'saved' });
      return true;
    } catch (error) {
      this.notice.set(this.noticeFor(error));
      return false;
    } finally {
      this.busy.set(null);
    }
  }

  /** Runs the full validation, sweep included, and keeps the sweep for the Checks tab. Resolves every issue found. */
  async runChecks(): Promise<Issue[]> {
    this.busy.set('checking');
    // Let the "checking" state paint before the synchronous sweep blocks the thread.
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    try {
      const overlay = this.overlay();
      const structural = validateOverlay(overlay, { published: this.published()?.overlay ?? null });
      // The sweep only makes sense on a draft without errors.
      const report = errorsOf(structural).length > 0 ? { runs: 0, issues: [] as Issue[] } : smokeTest(contentFor(overlay));
      this.sweepResult.set({ key: JSON.stringify(overlay), runs: report.runs, issues: report.issues, at: Date.now() });
      return [...structural, ...report.issues];
    } finally {
      this.busy.set(null);
    }
  }

  /** Saves what is unsaved, runs the checks and, if there is no error, publishes the draft as the next version. */
  async publish(note: string): Promise<boolean> {
    if (this.busy()) return false;
    if (this.dirty() && !(await this.save())) return false;
    const all = await this.runChecks();
    if (errorsOf(all).length > 0) {
      this.notice.set({ kind: 'checksFailed' });
      this.selectTab('checks');
      return false;
    }
    this.busy.set('publishing');
    try {
      const head = await this.api.publish(note, this.revision(), this.rollbackOf());
      this.published.set({ version: head.version, overlay: this.overlay() });
      this.baseVersion.set(head.version);
      this.rollbackOf.set(null);
      this.notice.set({ kind: 'published', version: head.version });
      // This device reads the new version like any other client would.
      void refreshOverlay();
      return true;
    } catch (error) {
      this.notice.set(this.noticeFor(error));
      return false;
    } finally {
      this.busy.set(null);
    }
  }

  /**
   * Copies a published version into the draft (on the server), then restores the ids that the current published version has and that
   * one lacks (retired), so ids are never removed. Nothing is published: the director reviews, saves and publishes.
   */
  async restore(version: number, asRollback: boolean): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set('restoring');
    try {
      await this.api.restore(version, this.revision());
      const draft = await this.api.draft();
      const restored = sanitizeOverlayReport(draft.document).overlay;
      const head = this.published()?.overlay;
      this.baseline.set(restored);
      this.overlay.set(head ? keepPublished(restored, head) : restored);
      this.revision.set(draft.revision);
      this.baseVersion.set(draft.baseVersion);
      this.updatedBy.set(draft.updatedBy);
      this.updatedAt.set(draft.updatedAt);
      this.dropped.set([]);
      this.rollbackOf.set(asRollback ? version : null);
      this.notice.set({ kind: 'restored', version });
      return true;
    } catch (error) {
      this.notice.set(this.noticeFor(error));
      return false;
    } finally {
      this.busy.set(null);
    }
  }

  private noticeFor(error: unknown): Notice {
    if (error instanceof ApiError) {
      if (error.status === 409) return { kind: 'conflict' };
      if (error.status === 422) return { kind: 'unchanged' };
      if (error.status === 400 || error.status === 413) return { kind: 'refused' };
    }
    return { kind: 'error' };
  }
}
