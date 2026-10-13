import { Injectable, computed, effect, inject, signal, untracked, type WritableSignal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { API_ENABLED, ApiError, api } from '../core/api';
import {
  applyPulled,
  flowLayoutCodec,
  flowLinkCodec,
  hashString,
  hashWith,
  markPushed,
  milestoneCodec,
  objectiveCodec,
  pendingRows,
  projectCodec,
  recurrenceCodec,
  reconcileLocal,
  todoCodec,
  type FlowLayoutWire,
  type FlowLinkWire,
  type MilestoneWire,
  type ObjectiveWire,
  type ProjectWire,
  type RecurrenceWire,
  type RowMeta,
  type RowMetaMap,
  type TodoWire,
} from '../lib/sync-engine';
import { AccountService } from './account.service';
import { DailyPlanService, type DailyPlanStage } from './daily-plan.service';
import { FlowService } from './flow.service';
import { MultitaskService } from './multitask.service';
import { ProjectsService } from './projects.service';
import { RecurrenceService } from './recurrence.service';
import { SettingsService } from './settings.service';
import { TodosService } from './todos.service';
import type { FlowLayout, FlowLink, Objective } from '../types/flow';
import type { Milestone, Project } from '../types/project';
import type { Recurrence } from '../types/recurrence';
import type { Todo } from '../types/todo';

export type SyncStatus = 'idle' | 'syncing' | 'error';
export type SyncErrorKind = 'network' | 'server' | 'session';

/** Per-user blobs that are rewritten whole. The backend stores them as three JSON columns plus two scalars. */
interface StateBlob {
  settings: Record<string, unknown>;
  dailyPlan: Record<string, unknown>;
  multitask: Record<string, unknown>;
  currentTaskId: string | null;
  hasCustomOrder: boolean;
}
interface StateWire extends StateBlob {
  updatedAt: number;
}
interface PullResponse {
  cursor: number;
  projects: ProjectWire[];
  milestones: MilestoneWire[];
  todos: TodoWire[];
  /** Absent when talking to a backend older than the Flow tables. */
  objectives?: ObjectiveWire[];
  flowLinks?: FlowLinkWire[];
  flowLayouts?: FlowLayoutWire[];
  /** Absent when talking to a backend older than recurring tasks. */
  recurrences?: RecurrenceWire[];
  state: StateWire | null;
}

interface SyncMeta {
  /** Account the metadata belongs to; a different account starts from scratch and merges local data into it. */
  email: string | null;
  cursor: number;
  projects: RowMetaMap;
  milestones: RowMetaMap;
  todos: RowMetaMap;
  /** Absent in metadata saved before Flow existed; read through `?? {}`. */
  objectives?: RowMetaMap;
  flowLinks?: RowMetaMap;
  flowLayouts?: RowMetaMap;
  recurrences?: RowMetaMap;
  /** Null until the first sync decided whether the server's state or the local one wins. */
  state: RowMeta | null;
}

const emptyMeta = (email: string | null): SyncMeta => ({
  email,
  cursor: 0,
  projects: {},
  milestones: {},
  todos: {},
  objectives: {},
  flowLinks: {},
  flowLayouts: {},
  recurrences: {},
  state: null,
});

const LOCAL_DEBOUNCE_MS = 2000;
const POLL_MS = 60_000;

/**
 * Keeps the local stores and the backend in step while signed in. The stores are the source of truth and are
 * untouched by this: edits and deletions are found by diffing them against `meta` (see `sync-engine.ts`).
 * Each cycle is pull → merge → push, last-write-wins per row on the client's edit time.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly accounts = inject(AccountService);
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly settings = inject(SettingsService);
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly multitask = inject(MultitaskService);
  private readonly flow = inject(FlowService);
  private readonly recurrences = inject(RecurrenceService);

  readonly status = signal<SyncStatus>('idle');
  readonly errorKind = signal<SyncErrorKind | null>(null);
  readonly lastSyncedAt = signal<number | null>(null);

  private readonly meta = localStorageSignal<SyncMeta>('productivist.sync', emptyMeta(null));
  private readonly stateBlob = computed<StateBlob>(() => this.buildState());

  private running = false;
  private rerun = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (!API_ENABLED) return;

    effect(() => {
      // Track every synced store; the callback only schedules, so it never writes back into them.
      this.todos.todos();
      this.projects.projects();
      this.projects.milestones();
      this.flow.objectives();
      this.flow.links();
      this.flow.layouts();
      this.recurrences.recurrences();
      this.stateBlob();
      untracked(() => this.schedule());
    });

    effect(() => {
      const account = this.accounts.account();
      untracked(() => {
        if (account) void this.sync('full');
        else this.meta.set(emptyMeta(null));
      });
    });

    setInterval(() => {
      if (document.visibilityState === 'visible') void this.sync('full');
    }, POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.sync('full');
    });
  }

  /** Pulls remote changes and pushes local ones now. */
  syncNow(): Promise<void> {
    return this.sync('full');
  }

  private schedule(): void {
    if (!this.accounts.account()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync('local'), LOCAL_DEBOUNCE_MS);
  }

  /** 'local' syncs are triggered by edits and cost no request when nothing is pending; 'full' always pulls. */
  private async sync(reason: 'local' | 'full'): Promise<void> {
    if (!this.accounts.account()) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.rerun = false;
        await this.cycle(reason);
      } while (this.rerun && this.accounts.account());
    } catch (error) {
      this.fail(error);
    } finally {
      this.running = false;
    }
  }

  private async cycle(reason: 'local' | 'full'): Promise<void> {
    const account = this.accounts.account();
    if (!account) return;
    if (this.meta().email !== account.email) this.meta.set(emptyMeta(account.email));

    this.reconcile();
    if (reason === 'local' && !this.hasPending()) return;

    this.status.set('syncing');
    const pulled = await api<PullResponse>(`/api/sync?since=${this.meta().cursor}`, { token: account.token });
    this.applyPull(pulled);

    this.reconcile();
    await this.push(account.token);

    this.errorKind.set(null);
    this.status.set('idle');
    this.lastSyncedAt.set(Date.now());
  }

  // ---- local → metadata ---------------------------------------------------------------------------------------

  private reconcile(): void {
    const now = Date.now();
    const stateHash = this.stateHash();
    this.meta.update((m) => ({
      ...m,
      projects: reconcileLocal(this.projects.projects(), m.projects, hashWith(projectCodec.toWire), now),
      milestones: reconcileLocal(this.projects.milestones(), m.milestones, hashWith(milestoneCodec.toWire), now),
      todos: reconcileLocal(this.todos.todos(), m.todos, hashWith(todoCodec.toWire), now),
      objectives: reconcileLocal(this.flow.objectives(), m.objectives ?? {}, hashWith(objectiveCodec.toWire), now),
      flowLinks: reconcileLocal(this.flow.links(), m.flowLinks ?? {}, hashWith(flowLinkCodec.toWire), now),
      flowLayouts: reconcileLocal(this.flow.layouts(), m.flowLayouts ?? {}, hashWith(flowLayoutCodec.toWire), now),
      recurrences: reconcileLocal(this.recurrences.recurrences(), m.recurrences ?? {}, hashWith(recurrenceCodec.toWire), now),
      state: m.state && m.state.h !== stateHash ? { h: stateHash, u: now, p: false } : m.state,
    }));
  }

  private hasPending(): boolean {
    const m = this.meta();
    const pending = (map: RowMetaMap) => Object.values(map).some((row) => !row.p);
    return (
      pending(m.projects) ||
      pending(m.milestones) ||
      pending(m.todos) ||
      pending(m.objectives ?? {}) ||
      pending(m.flowLinks ?? {}) ||
      pending(m.flowLayouts ?? {}) ||
      pending(m.recurrences ?? {}) ||
      (m.state !== null && !m.state.p)
    );
  }

  // ---- server → local -----------------------------------------------------------------------------------------

  private applyPull(pulled: PullResponse): void {
    const m = this.meta();

    const projects = applyPulled(this.projects.projects(), m.projects, pulled.projects, projectCodec.fromWire, hashWith(projectCodec.toWire));
    const milestones = applyPulled(this.projects.milestones(), m.milestones, pulled.milestones, milestoneCodec.fromWire, hashWith(milestoneCodec.toWire));
    const todos = applyPulled(this.todos.todos(), m.todos, pulled.todos, todoCodec.fromWire, hashWith(todoCodec.toWire));
    const objectives = applyPulled(this.flow.objectives(), m.objectives ?? {}, pulled.objectives ?? [], objectiveCodec.fromWire, hashWith(objectiveCodec.toWire));
    const flowLinks = applyPulled(this.flow.links(), m.flowLinks ?? {}, pulled.flowLinks ?? [], flowLinkCodec.fromWire, hashWith(flowLinkCodec.toWire));
    const flowLayouts = applyPulled(this.flow.layouts(), m.flowLayouts ?? {}, pulled.flowLayouts ?? [], flowLayoutCodec.fromWire, hashWith(flowLayoutCodec.toWire));
    const recurrences = applyPulled(this.recurrences.recurrences(), m.recurrences ?? {}, pulled.recurrences ?? [], recurrenceCodec.fromWire, hashWith(recurrenceCodec.toWire));
    if (projects.items !== this.projects.projects()) this.projects.projects.set(projects.items);
    if (milestones.items !== this.projects.milestones()) this.projects.milestones.set(milestones.items);
    if (todos.items !== this.todos.todos()) this.todos.todos.set(todos.items);
    if (objectives.items !== this.flow.objectives()) this.flow.objectives.set(objectives.items);
    if (flowLinks.items !== this.flow.links()) this.flow.links.set(flowLinks.items);
    if (flowLayouts.items !== this.flow.layouts()) this.flow.layouts.set(flowLayouts.items);
    if (recurrences.items !== this.recurrences.recurrences()) this.recurrences.recurrences.set(recurrences.items);

    let state = m.state;
    const remote = pulled.state;
    if (remote) {
      const localNewer = state !== null && !state.p && state.u > remote.updatedAt;
      const echo = state !== null && state.p && state.u === remote.updatedAt;
      // First sync (state === null): the server wins, so a fresh device cannot overwrite settings made elsewhere.
      if (!localNewer && !echo) {
        this.applyState(remote);
        state = { h: this.stateHash(), u: remote.updatedAt, p: true };
      }
    } else if (state === null) {
      state = { h: this.stateHash(), u: Date.now(), p: false };
    }

    this.meta.set({
      ...m,
      cursor: pulled.cursor,
      projects: projects.meta,
      milestones: milestones.meta,
      todos: todos.meta,
      objectives: objectives.meta,
      flowLinks: flowLinks.meta,
      flowLayouts: flowLayouts.meta,
      recurrences: recurrences.meta,
      state,
    });
    // Rows another device deleted may leave links behind; the next reconcile turns the sweep into tombstones.
    this.projects.sweepFlow();
    // Occurrences or series pulled from another device may have made one due here (idempotent: both devices
    // produce the same deterministic occurrence id).
    this.recurrences.materialize();
  }

  // ---- metadata → server --------------------------------------------------------------------------------------

  private async push(token: string): Promise<void> {
    const m = this.meta();
    const projects = pendingRows<Project, ProjectWire>(this.projects.projects(), m.projects, projectCodec.toWire, projectCodec.tombstone);
    const milestones = pendingRows<Milestone, MilestoneWire>(this.projects.milestones(), m.milestones, milestoneCodec.toWire, milestoneCodec.tombstone);
    const todos = pendingRows<Todo, TodoWire>(this.todos.todos(), m.todos, todoCodec.toWire, todoCodec.tombstone);
    const objectives = pendingRows<Objective, ObjectiveWire>(this.flow.objectives(), m.objectives ?? {}, objectiveCodec.toWire, objectiveCodec.tombstone);
    const flowLinks = pendingRows<FlowLink, FlowLinkWire>(this.flow.links(), m.flowLinks ?? {}, flowLinkCodec.toWire, flowLinkCodec.tombstone);
    const flowLayouts = pendingRows<FlowLayout, FlowLayoutWire>(this.flow.layouts(), m.flowLayouts ?? {}, flowLayoutCodec.toWire, flowLayoutCodec.tombstone);
    const recurrences = pendingRows<Recurrence, RecurrenceWire>(this.recurrences.recurrences(), m.recurrences ?? {}, recurrenceCodec.toWire, recurrenceCodec.tombstone);
    const state = m.state && !m.state.p ? { ...this.stateBlob(), updatedAt: m.state.u } : undefined;

    if (
      !projects.rows.length &&
      !milestones.rows.length &&
      !todos.rows.length &&
      !objectives.rows.length &&
      !flowLinks.rows.length &&
      !flowLayouts.rows.length &&
      !recurrences.rows.length &&
      !state
    ) {
      return;
    }
    await api('/api/sync', {
      method: 'POST',
      token,
      body: {
        projects: projects.rows,
        milestones: milestones.rows,
        todos: todos.rows,
        objectives: objectives.rows,
        flowLinks: flowLinks.rows,
        flowLayouts: flowLayouts.rows,
        recurrences: recurrences.rows,
        state,
      },
    });

    this.meta.update((current) => ({
      ...current,
      projects: markPushed(current.projects, projects.sent),
      milestones: markPushed(current.milestones, milestones.sent),
      todos: markPushed(current.todos, todos.sent),
      objectives: markPushed(current.objectives ?? {}, objectives.sent),
      flowLinks: markPushed(current.flowLinks ?? {}, flowLinks.sent),
      flowLayouts: markPushed(current.flowLayouts ?? {}, flowLayouts.sent),
      recurrences: markPushed(current.recurrences ?? {}, recurrences.sent),
      state:
        current.state && state && current.state.u === state.updatedAt && !current.state.p
          ? { ...current.state, p: true }
          : current.state,
    }));
  }

  private fail(error: unknown): void {
    if (error instanceof ApiError && error.status === 401) {
      this.accounts.logout();
      this.errorKind.set('session');
    } else {
      this.errorKind.set(error instanceof ApiError ? 'server' : 'network');
    }
    this.status.set('error');
  }

  // ---- state blob ---------------------------------------------------------------------------------------------

  private stateHash(): string {
    return hashString(JSON.stringify(this.stateBlob()));
  }

  private buildState(): StateBlob {
    const s = this.settings;
    const d = this.dailyPlan;
    const mt = this.multitask;
    return {
      settings: {
        theme: s.theme(),
        language: s.language(),
        focusSeconds: s.focusSeconds(),
        breakSeconds: s.breakSeconds(),
        bellSound: s.bellSound(),
        bellSoundId: s.bellSoundId(),
        keepRinging: s.keepRinging(),
        clockStyle: s.clockStyle(),
        boxClockOrder: s.boxClockOrder(),
        multitaskEnabled: mt.enabled(),
      },
      dailyPlan: {
        stage: d.stage(),
        objectives: d.objectives(),
        projectAssignments: d.projectAssignments(),
        assignments: d.assignments(),
        executionLots: d.executionLots(),
        activeLotIndex: d.activeLotIndex(),
        committedTaskIds: d.committedPlannedTaskIds(),
      },
      multitask: {
        cards: mt.cards(),
        archivedGreen: mt.archivedGreen(),
        archivedRed: mt.archivedRed(),
      },
      currentTaskId: this.todos.currentTaskId(),
      hasCustomOrder: this.todos.hasCustomOrder(),
    };
  }

  /** Applies only well-typed fields, so a blob written by an older or newer client cannot break the stores. */
  private applyState(state: StateBlob): void {
    const s = this.settings;
    const set = settingsApplier(state.settings);
    set('theme', s.theme, isOneOf('light', 'dark', 'japanese', 'nordic'));
    set('language', s.language, isOneOf('en', 'es'));
    set('focusSeconds', s.focusSeconds, isNumber);
    set('breakSeconds', s.breakSeconds, isNumber);
    set('bellSound', s.bellSound, isBoolean);
    set('bellSoundId', s.bellSoundId, isOneOf('alarmClock', 'bowl', 'marimba', 'chime', 'birds', 'gong', 'digital', 'classic', 'siren', 'buzzer'));
    set('keepRinging', s.keepRinging, isBoolean);
    set('clockStyle', s.clockStyle, isOneOf('boxes', 'ring'));
    set('boxClockOrder', s.boxClockOrder, isOneOf('sequential', 'random'));
    set('multitaskEnabled', this.multitask.enabled, isBoolean);

    const d = this.dailyPlan;
    const plan = settingsApplier(state.dailyPlan);
    plan('stage', d.stage as WritableSignal<DailyPlanStage>, isOneOf<DailyPlanStage>('prompt', 'chooseProjects', 'planning', 'groupingParallel'));
    plan('objectives', d.objectives, isArray);
    plan('projectAssignments', d.projectAssignments, isRecord);
    plan('assignments', d.assignments, isRecord);
    plan('executionLots', d.executionLots, isArray);
    plan('activeLotIndex', d.activeLotIndex, isNumber);
    plan('committedTaskIds', d.committedPlannedTaskIds, isArray);

    const mt = settingsApplier(state.multitask);
    mt('cards', this.multitask.cards, isArray);
    mt('archivedGreen', this.multitask.archivedGreen, isNumber);
    mt('archivedRed', this.multitask.archivedRed, isNumber);

    if (state.currentTaskId === null || typeof state.currentTaskId === 'string') this.todos.currentTaskId.set(state.currentTaskId);
    if (typeof state.hasCustomOrder === 'boolean') this.todos.hasCustomOrder.set(state.hasCustomOrder);
  }
}

type Guard<T> = (value: unknown) => value is T;

const isNumber: Guard<number> = (v): v is number => typeof v === 'number' && Number.isFinite(v);
const isBoolean: Guard<boolean> = (v): v is boolean => typeof v === 'boolean';
const isArray = <T>(v: unknown): v is T[] => Array.isArray(v);
const isRecord = <T>(v: unknown): v is T => typeof v === 'object' && v !== null && !Array.isArray(v);
function isOneOf<T extends string>(...allowed: T[]): Guard<T> {
  return (v): v is T => typeof v === 'string' && (allowed as string[]).includes(v);
}

function settingsApplier(source: Record<string, unknown> | undefined) {
  return <T>(key: string, target: WritableSignal<T>, valid: Guard<T>): void => {
    const value = source?.[key];
    if (valid(value)) target.set(value);
  };
}
