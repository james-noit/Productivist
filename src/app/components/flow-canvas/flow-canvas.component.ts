import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import {
  CARD_GAP,
  HEADER_HEIGHT,
  LANES,
  LANE_TOP,
  MIN_ZOOM,
  OBJECTIVE_HEIGHT,
  OBJECTIVE_WIDTH,
  ROW_HEIGHT,
  WORK_CARD_WIDTH,
  cardX,
  clampViewport,
  clampZoom,
  contentBounds,
  fitViewport,
  headerPort,
  laneAt,
  laneLayout,
  linkMid,
  linkPath,
  minZoomFor,
  objectiveInPort,
  objectiveOutPort,
  objectiveRect,
  rectContains,
  rectsIntersect,
  rowPort,
  visibleWorldRect,
  workCardHeight,
  workCardRect,
  zoomAround,
  type LaneKey,
  type Point,
  type Rect,
  type Viewport,
} from '../../../lib/flow-geometry';
import { buildFlowGraph, chainOf, milestoneKey, objectiveKey, taskKey, type Progress, type WorkCard } from '../../../lib/flow-graph';
import { layoutFlow, pushDownOverlaps } from '../../../lib/flow-layout';
import { HORIZONS, isLongerHorizon, validTargets, type FlowSource, type LinkRefusal } from '../../../lib/flow-rules';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import type { Horizon, Objective } from '../../../types/flow';
import type { Project } from '../../../types/project';
import { FlowLinkMenuComponent } from '../flow-link-menu/flow-link-menu.component';
import { FlowMilestoneNodeComponent } from '../flow-milestone-node/flow-milestone-node.component';
import { FlowObjectiveNodeComponent } from '../flow-objective-node/flow-objective-node.component';
import {
  FlowSelectionBarComponent,
  type BarAction,
  type BarConfirm,
  type BarKind,
} from '../flow-selection-bar/flow-selection-bar.component';
import { FlowViewState } from '../project-flow/flow-view-state';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

type Selection = { kind: 'node'; key: string } | { kind: 'link'; id: string } | null;

interface Edge {
  id: string;
  d: string;
  mid: Point;
  state: '' | 'lit' | 'dim' | 'selected';
}

type Gesture =
  | { kind: 'pan'; pointerId: number; startX: number; startY: number; moved: boolean; origin: Viewport }
  | { kind: 'node'; pointerId: number; startX: number; startY: number; moved: boolean; key: string; origin: Point }
  | { kind: 'task'; pointerId: number; startX: number; startY: number; moved: boolean; taskId: string }
  | { kind: 'link'; pointerId: number; startX: number; startY: number; moved: boolean; source: FlowSource; from: Point };

/** The label of each lane, by key; the geometry (x, width, collapsed) comes from `laneLayout`. */
const LANE_TEXT: Readonly<Record<LaneKey, { label: string; span: string }>> = Object.fromEntries(
  LANES.map((key) => [
    key,
    { label: key === 'work' ? 'flow.lanes.work' : `flow.horizons.${key}`, span: key === 'work' ? 'flow.lanes.workSpan' : `flow.horizonSpans.${key}` },
  ]),
) as Record<LaneKey, { label: string; span: string }>;

interface LaneView {
  key: LaneKey;
  x: number;
  width: number;
  collapsed: boolean;
  label: string;
  span: string;
  /** The horizon a lane toggle hides or shows; null for Work, which cannot be collapsed. */
  horizon: Horizon | null;
  /** Objectives in a collapsed lane (those the status filters let through). */
  count: number;
}

/** A question waiting for an answer next to the selected objective. */
type Pending =
  | { kind: 'delete'; key: string }
  | { kind: 'horizon'; key: string; horizon: Horizon; pos: Point };

/** Pointer travel before a press becomes a drag (and a click stays a click). */
const DRAG_THRESHOLD = 4;
/** Above this many nodes only the ones near the viewport are rendered. */
const CULL_THRESHOLD = 150;
const CULL_MARGIN = 300;
const BUTTON_ZOOM = 1.2;
const KEY_PAN = 80;
/** Alt + arrow moves the selected card by this many world pixels (times 4 with Shift). */
const KEY_MOVE = 8;
/** Gap between the selected node and its toolbar, and the margin the toolbar keeps from the canvas edge (screen px). */
const BAR_GAP = 8;
const BAR_EDGE = 8;
const BAR_HEIGHT = 40;
const CONFIRM_HEIGHT = 80;
const COMPACT = '(max-width: 599px)';
/** Rough width of the selection toolbar by kind, with labels and icon-only, used to keep it inside the canvas. */
const BAR_WIDTH: Readonly<Record<BarKind, readonly [number, number]>> = { objective: [330, 140], milestone: [270, 108], nomilestone: [120, 44], task: [190, 76] };
const MENU_WIDTH = 272;
const MENU_HEIGHT = 288;
/** A press this close (screen px) to a port counts as a press on it, wherever the DOM says it landed. */
const PORT_REACH = 14;
const DEFAULT_VIEWPORT: Viewport = { x: 16, y: 8, k: 1 };
/** Screen px between the dots of the background grid at 100%; doubled while zoom would pack them closer than `GRID_MIN`. */
const GRID_STEP = 24;
const GRID_MIN = 12;
/** What `productivist.flowViewport` keeps per project; `fit` marks a view that follows the canvas (fit mode). */
interface StoredViewport extends Viewport {
  fit?: true;
}
const ORIGIN: Point = { x: 0, y: 0 };
const NO_PROGRESS: Progress = { done: 0, total: 0, percent: 0 };

/**
 * The Flow diagram's canvas: a viewport you pan (drag the background, wheel) and zoom (Ctrl+wheel, the
 * toolbar), a world `div` moved with one CSS transform, the lane bands, an SVG layer of links and the
 * cards. It owns the graph, the placement and every gesture (move a card, drag a task row to another
 * milestone, drag from a port to link, select a node or link), so the card components stay presentational.
 *
 * Performance: one computed graph and one computed placement, neither of which reads the drag signal; a
 * drag keeps its position in a local signal and commits once on pointer-up. Port positions come from fixed
 * card metrics (lib/flow-geometry), never from the DOM.
 */
@Component({
  selector: 'app-flow-canvas',
  standalone: true,
  imports: [TranslatePipe, FlowObjectiveNodeComponent, FlowMilestoneNodeComponent, FlowLinkMenuComponent, FlowSelectionBarComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-canvas.component.html',
  styleUrl: './flow-canvas.component.css',
})
export class FlowCanvasComponent {
  private readonly flow = inject(FlowService);
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly state = inject(FlowViewState);
  readonly view = inject(ViewService);
  private readonly injector = inject(Injector);
  private readonly viewportEl = viewChild.required<ElementRef<HTMLElement>>('viewportEl');

  readonly project = input.required<Project>();

  readonly editObjective = output<string>();
  readonly editMilestone = output<string>();
  readonly editTask = output<string>();
  /** Double-click on an empty spot of a horizon lane (`y` is the world y for the new card's top), or the empty state's button (`y` null: wherever it fits). */
  readonly createObjective = output<{ horizon: Horizon; y: number | null }>();

  /** The lane bands: a hidden horizon is a 36px strip and the lanes after it move left. */
  protected readonly lanes = computed(() => laneLayout(this.state.hiddenHorizons()));

  // ---- data ------------------------------------------------------------------------------------------------

  readonly projectId = computed(() => this.project().id);

  private readonly milestones = computed(() => {
    const id = this.projectId();
    return this.projects
      .milestones()
      .filter((m) => m.projectId === id)
      .sort((a, b) => a.order - b.order);
  });

  private readonly projectTodos = computed(() => {
    const id = this.projectId();
    return this.todos.todos().filter((t) => t.projectId === id);
  });

  readonly graph = computed(() => {
    const id = this.projectId();
    return buildFlowGraph({
      projectId: id,
      objectives: this.flow.objectivesByProject().get(id) ?? [],
      links: this.flow.linksByProject().get(id) ?? [],
      milestones: this.milestones(),
      todos: this.projectTodos(),
      showDone: this.view.showDoneTasks(),
    });
  });

  private readonly storedLayout = computed(() => this.flow.layoutsByProject().get(this.projectId()));
  private readonly collapsedKeys = computed(() => new Set(this.storedLayout()?.collapsed ?? []));

  /** The objectives that pass the horizon and status filters (the ones in a collapsed lane are not drawn). */
  readonly objectives = computed(() => this.graph().objectives.filter((o) => this.state.shows(o)));

  /** The lane bands with their labels and, for a collapsed horizon, how many objectives it is holding back. */
  protected readonly laneViews = computed<LaneView[]>(() => {
    const objectives = this.graph().objectives;
    return this.lanes().map((box) => {
      const horizon = box.key === 'work' ? null : box.key;
      return {
        ...box,
        ...LANE_TEXT[box.key],
        horizon,
        count: box.collapsed ? objectives.filter((o) => o.horizon === horizon && this.state.statusShown(o)).length : 0,
      };
    });
  });

  private readonly visibleObjectiveIds = computed(() => new Set(this.objectives().map((o) => o.id)));

  /** Every card's top-left (stored positions over the automatic layout) and the Work cards' heights. */
  readonly placement = computed(() => {
    const graph = this.graph();
    const collapsed = this.collapsedKeys();
    const visible = this.visibleObjectiveIds();
    const rowOf = new Map<string, { cardKey: string; index: number }>();
    for (const [id, index] of graph.rowOfTask) rowOf.set(taskKey(id), { cardKey: graph.cardOfTask.get(id)!, index });
    return layoutFlow({
      cards: graph.cards.map((c) => ({ key: c.key, rows: c.rows.length, collapsed: collapsed.has(c.key) })),
      objectives: this.objectives().map((o) => ({ key: objectiveKey(o.id), horizon: o.horizon, order: o.order })),
      rowOf,
      edges: graph.links
        .filter((l) => visible.has(l.toObjectiveId))
        .map((l) => ({ from: `${l.fromKind}:${l.fromId}`, to: objectiveKey(l.toObjectiveId) })),
      stored: this.storedLayout()?.positions ?? {},
      lanes: this.lanes(),
    });
  });

  /** The lane bands reach at least the bottom of the visible area, whatever the zoom and pan. */
  protected readonly worldHeight = computed(() => {
    const base = this.placement().bottom + 600;
    const size = this.viewSize();
    if (!size.w) return base;
    const view = visibleWorldRect(this.viewport(), size.w, size.h);
    return Math.max(base, view.y + view.h + CARD_GAP);
  });

  // ---- viewport --------------------------------------------------------------------------------------------

  /** What pan, zoom and fit asked for. Never read directly: `viewport` is this, clamped to the content and the canvas size. */
  private readonly rawViewport = signal<Viewport>(DEFAULT_VIEWPORT);
  /** The diagram's extent in world px (the lane bands down to the lowest card). */
  private readonly bounds = computed(() => contentBounds(this.lanes(), this.placement().bottom));
  /** The lowest zoom for this diagram in this canvas: 75% of the fit zoom, so zooming out never just adds blank space. */
  protected readonly minZoom = computed(() => {
    const size = this.viewSize();
    return size.w ? minZoomFor(this.bounds(), size.w, size.h) : MIN_ZOOM;
  });
  /** The pan and zoom in effect: the raw one kept inside the diagram's bounds (content or size changes re-clamp it for free). */
  readonly viewport = computed(() => {
    const raw = this.rawViewport();
    const size = this.viewSize();
    return size.w ? clampViewport(raw, this.bounds(), size.w, size.h) : raw;
  });
  readonly zoomPercent = computed(() => Math.round(this.viewport().k * 100));
  protected readonly worldTransform = computed(() => {
    const v = this.viewport();
    return `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  });
  private readonly viewSize = signal({ w: 0, h: 0 });
  /** The dot grid behind the lanes, moved and scaled with the world (CSS custom properties on the canvas). */
  protected readonly grid = computed(() => {
    const v = this.viewport();
    let step = GRID_STEP;
    while (step * v.k < GRID_MIN) step *= 2;
    const size = step * v.k;
    return { size: `${size}px`, x: `${v.x % size}px`, y: `${v.y % size}px` };
  });
  private readonly storedViewports = localStorageSignal<Record<string, StoredViewport>>('productivist.flowViewport', {});
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Fit mode: the diagram is kept fitted (a project seen for the first time, *Fit*, *Tidy up*, a restored fit) and
   * is fitted again on every resize and lane collapse, until the user pans or zooms.
   */
  private fitMode = false;

  // ---- interaction state -----------------------------------------------------------------------------------

  readonly selection = signal<Selection>(null);
  /** A card being moved: its key and live top-left. The placement does not read it. */
  protected readonly drag = signal<{ key: string; pos: Point } | null>(null);
  /** A task row being moved to another card. */
  protected readonly taskDrag = signal<{ id: string; title: string; pos: Point; over: string | null } | null>(null);
  /** A link being dragged from a port. */
  protected readonly linkSource = signal<FlowSource | null>(null);
  protected readonly linkPreview = signal<{ from: Point; to: Point; hover: string | null } | null>(null);
  protected readonly refusal = signal<{ id: string; reason: LinkRefusal } | null>(null);
  protected readonly panning = signal(false);
  protected readonly pinching = signal(false);
  private gesture: Gesture | null = null;
  /** Fingers currently down (client coordinates), for the two-finger pinch. */
  private readonly touches = new Map<number, Point>();
  private pinch: { dist: number; mid: Point; origin: Viewport } | null = null;
  private refusalTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly selectedKey = computed(() => {
    const sel = this.selection();
    return sel?.kind === 'node' ? sel.key : null;
  });
  protected readonly selectedLinkId = computed(() => {
    const sel = this.selection();
    return sel?.kind === 'link' ? sel.id : null;
  });

  /** Node key whose link menu is open (always the selected node). */
  protected readonly menuKey = signal<string | null>(null);

  /** What a node would link from; null for nodes that cannot be linked (the "No milestone" card). */
  private sourceOf(key: string): FlowSource | null {
    const sep = key.indexOf(':');
    const kind = key.slice(0, sep);
    const id = key.slice(sep + 1);
    if (kind === 'objective') return { kind, id };
    if (kind === 'milestone' || kind === 'task') return { kind, id, projectId: this.projectId() };
    return null;
  }

  protected readonly menuSource = computed(() => {
    const key = this.menuKey();
    return key ? this.sourceOf(key) : null;
  });

  protected readonly menuLabel = computed(() => {
    const key = this.menuKey();
    return key ? this.labelOf(key) : '';
  });

  /** The name of a node, for the toolbar and the link menu. */
  private labelOf(key: string): string {
    const id = key.slice(key.indexOf(':') + 1);
    if (key.startsWith('objective:')) return this.graph().objectives.find((o) => o.id === id)?.title ?? '';
    if (key.startsWith('task:')) return this.projectTodos().find((t) => t.id === id)?.title ?? '';
    return this.graph().cards.find((c) => c.key === key)?.milestone?.name ?? '';
  }

  /** A question asked next to the selected objective (delete it, or change its horizon and lose some links). */
  protected readonly pending = signal<Pending | null>(null);
  protected readonly barConfirm = computed<BarConfirm | null>(() => {
    const pending = this.pending();
    return pending && pending.key === this.selectedKey() ? pending.kind : null;
  });

  /** A gesture is running: the toolbar steps aside until it ends. */
  private readonly busy = computed(
    () => this.drag() !== null || this.taskDrag() !== null || this.linkSource() !== null || this.panning() || this.pinching(),
  );

  /** The selected node's rect in world units, or null when it is not on show (a row of a collapsed card, a vanished node). */
  private nodeRect(key: string): Rect | null {
    const graph = this.graph();
    if (key.startsWith('objective:')) return objectiveRect(this.posOf(key));
    if (key.startsWith('task:')) {
      const id = key.slice('task:'.length);
      const cardKey = graph.cardOfTask.get(id);
      const row = graph.rowOfTask.get(id);
      if (cardKey === undefined || row === undefined || this.collapsedKeys().has(cardKey)) return null;
      const pos = this.posOf(cardKey);
      return { x: pos.x, y: pos.y + HEADER_HEIGHT + row * ROW_HEIGHT, w: WORK_CARD_WIDTH, h: ROW_HEIGHT };
    }
    const card = graph.cards.find((c) => c.key === key);
    return card ? workCardRect(this.posOf(key), this.heightOf(card)) : null;
  }

  private static kindOf(key: string): BarKind {
    return key.startsWith('objective:') ? 'objective' : key.startsWith('task:') ? 'task' : key.startsWith('milestone:') ? 'milestone' : 'nomilestone';
  }

  private readonly compact = signal(typeof matchMedia === 'function' && matchMedia(COMPACT).matches);

  /**
   * The selection toolbar: which node, and where it goes on screen. Above the node, horizontally centred and kept
   * inside the canvas; below it when there is no room above. One computed from the node's world rect and the
   * viewport, so it follows pan and zoom; null while a gesture runs or nothing linkable is selected.
   */
  protected readonly bar = computed(() => {
    if (this.busy()) return null;
    const key = this.selectedKey();
    if (!key) return null;
    const rect = this.nodeRect(key);
    if (!rect) return null;
    const kind = FlowCanvasComponent.kindOf(key);
    const confirming = this.barConfirm() !== null;
    const v = this.viewport();
    const size = this.viewSize();
    const left = rect.x * v.k + v.x;
    const top = rect.y * v.k + v.y;
    const right = left + rect.w * v.k;
    const bottom = top + rect.h * v.k;
    const width = confirming ? Math.min(352, Math.max(0, size.w - BAR_EDGE * 2)) : BAR_WIDTH[kind][this.compact() ? 1 : 0];
    const height = confirming ? CONFIRM_HEIGHT : BAR_HEIGHT;
    const above = top - height - BAR_GAP >= BAR_EDGE;
    const y = Math.min(Math.max(above ? top - height - BAR_GAP : bottom + BAR_GAP, BAR_EDGE), Math.max(BAR_EDGE, size.h - height - BAR_EDGE));
    const half = width / 2;
    const x = size.w > width + BAR_EDGE * 2 ? Math.min(Math.max((left + right) / 2, half + BAR_EDGE), size.w - half - BAR_EDGE) : size.w / 2;
    return { key, kind, x, y, height, above, nodeBottom: bottom };
  });

  protected readonly barName = computed(() => {
    const key = this.selectedKey();
    return key ? this.labelOf(key) : '';
  });
  protected readonly barAchieved = computed(() => {
    const key = this.selectedKey();
    return !!key && this.graph().objectives.find((o) => `objective:${o.id}` === key)?.status === 'achieved';
  });
  protected readonly barCollapsed = computed(() => {
    const key = this.selectedKey();
    return !!key && this.collapsedKeys().has(key);
  });

  /** Where the link menu opens: next to the toolbar, on whichever side has room; the canvas corner when the toolbar is hidden. */
  protected readonly menuPlace = computed(() => {
    const bar = this.bar();
    const size = this.viewSize();
    if (!bar || !size.w) return { left: null, top: 12, bottom: null, right: 12 };
    const left = Math.min(Math.max(bar.x - MENU_WIDTH / 2, BAR_EDGE), Math.max(BAR_EDGE, size.w - MENU_WIDTH - BAR_EDGE));
    if (bar.above && bar.y - BAR_GAP >= MENU_HEIGHT) return { left, top: null, bottom: size.h - bar.y + 4, right: null };
    const top = bar.above ? bar.nodeBottom + BAR_GAP : bar.y + bar.height + 4;
    return { left, top: Math.min(top, Math.max(BAR_EDGE, size.h - MENU_HEIGHT - BAR_EDGE)), bottom: null, right: null };
  });

  /** What the selected node serves and what feeds it; null when no node is selected. */
  private readonly chain = computed(() => {
    const key = this.selectedKey();
    return key ? chainOf(this.graph(), key) : null;
  });
  protected readonly highlight = computed(() => this.chain()?.nodes ?? null);

  /** Objectives a dragged link may end at (null when no link is being dragged). */
  private readonly linkTargets = computed(() => {
    const source = this.linkSource();
    return source ? new Set(validTargets(this.flow.objectives(), this.flow.links(), source).map((o) => o.id)) : null;
  });
  protected readonly hoverId = computed(() => this.linkPreview()?.hover ?? null);

  protected readonly dropLane = computed(() => {
    const drag = this.drag();
    if (!drag?.key.startsWith('objective:')) return null;
    return this.horizonAt(drag.pos.x + OBJECTIVE_WIDTH / 2);
  });

  /** The open horizon lane under a world x; Work, a collapsed strip (not a drop target) and the outside give null. */
  private horizonAt(worldX: number): Horizon | null {
    const lane = laneAt(worldX, this.lanes());
    return lane && lane !== 'work' && !this.lanes().find((l) => l.key === lane)?.collapsed ? lane : null;
  }

  // ---- rendering lists -------------------------------------------------------------------------------------

  private readonly nodeCount = computed(() => {
    const graph = this.graph();
    return graph.cards.reduce((sum, c) => sum + 1 + c.rows.length, this.objectives().length);
  });

  /** The area worth rendering when the diagram is large; null renders everything. */
  private readonly cullArea = computed(() => {
    if (this.nodeCount() <= CULL_THRESHOLD) return null;
    const size = this.viewSize();
    return size.w ? visibleWorldRect(this.viewport(), size.w, size.h, CULL_MARGIN) : null;
  });

  protected readonly renderedCards = computed(() => {
    const area = this.cullArea();
    const cards = this.graph().cards;
    if (!area) return cards;
    const { positions, heights } = this.placement();
    return cards.filter((c) => {
      const pos = positions.get(c.key);
      return !pos || rectsIntersect(area, workCardRect(pos, heights.get(c.key) ?? 0));
    });
  });

  protected readonly renderedObjectives = computed(() => {
    const area = this.cullArea();
    const objectives = this.objectives();
    if (!area) return objectives;
    const { positions } = this.placement();
    return objectives.filter((o) => {
      const pos = positions.get(objectiveKey(o.id));
      return !pos || rectsIntersect(area, objectiveRect(pos));
    });
  });

  /** Where a card is: its live drag position, else the placement. */
  protected posOf(key: string): Point {
    const drag = this.drag();
    if (drag?.key === key) return drag.pos;
    // An objective dropped into another horizon waits for its answer where it was dropped.
    const pending = this.pending();
    if (pending?.kind === 'horizon' && pending.key === key) return pending.pos;
    return this.placement().positions.get(key) ?? ORIGIN;
  }

  protected heightOf(card: WorkCard): number {
    return this.placement().heights.get(card.key) ?? workCardHeight(card.rows.length, false);
  }

  protected progressOf(id: string): Progress {
    return this.graph().progress.get(id) ?? NO_PROGRESS;
  }

  /** Outside the highlighted chain of the selected node. */
  protected isDimmed(key: string): boolean {
    const lit = this.highlight();
    return !!lit && !lit.has(key);
  }

  protected linkStateOf(id: string): 'valid' | 'invalid' | null {
    const targets = this.linkTargets();
    return targets ? (targets.has(id) ? 'valid' : 'invalid') : null;
  }

  /** Links as SVG paths between their ports. Reads the drag signal, so a moving card drags its links along. */
  protected readonly edges = computed<Edge[]>(() => {
    const graph = this.graph();
    const visible = this.visibleObjectiveIds();
    const collapsed = this.collapsedKeys();
    const chain = this.chain();
    const selectedLink = this.selectedLinkId();
    const area = this.cullArea();
    const out: Edge[] = [];
    for (const link of graph.links) {
      if (!visible.has(link.toObjectiveId)) continue;
      let from: Point | null = null;
      if (link.fromKind === 'task') {
        const cardKey = graph.cardOfTask.get(link.fromId);
        const row = graph.rowOfTask.get(link.fromId);
        if (cardKey !== undefined && row !== undefined) {
          const pos = this.posOf(cardKey);
          from = collapsed.has(cardKey) ? headerPort(pos) : rowPort(pos, row);
        }
      } else if (link.fromKind === 'milestone') {
        from = headerPort(this.posOf(milestoneKey(link.fromId)));
      } else if (visible.has(link.fromId)) {
        from = objectiveOutPort(this.posOf(objectiveKey(link.fromId)));
      }
      if (!from) continue;
      const to = objectiveInPort(this.posOf(objectiveKey(link.toObjectiveId)));
      if (area && !rectsIntersect(area, { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) })) continue;
      out.push({
        id: link.id,
        d: linkPath(from, to),
        mid: linkMid(from, to),
        state: link.id === selectedLink ? 'selected' : chain ? (chain.links.has(link.id) ? 'lit' : 'dim') : '',
      });
    }
    return out;
  });

  protected readonly selectedEdge = computed(() => {
    const id = this.selectedLinkId();
    return id ? (this.edges().find((e) => e.id === id) ?? null) : null;
  });

  protected readonly previewPath = computed(() => {
    const preview = this.linkPreview();
    return preview ? linkPath(preview.from, preview.to) : null;
  });

  constructor() {
    // Each project remembers its own pan and zoom on this device; a project seen for the first time is fitted.
    effect(() => {
      const id = this.projectId();
      untracked(() => this.restoreViewport(id));
    });

    // Fit mode follows a lane collapsing or expanding (the content width changes); manual views only get clamped.
    effect(() => {
      this.lanes();
      untracked(() => {
        if (this.fitMode) afterNextRender(() => this.fitMode && this.fit(true), { injector: this.injector });
      });
    });

    // The selection may point at something deleted here or, after a sync, on another device.
    effect(() => {
      const sel = this.selection();
      if (!sel) return;
      const graph = this.graph();
      const alive =
        sel.kind === 'link'
          ? graph.links.some((l) => l.id === sel.id)
          : sel.key.startsWith('task:')
            ? graph.cardOfTask.has(sel.key.slice(5))
            : sel.key.startsWith('objective:')
              ? this.visibleObjectiveIds().has(sel.key.slice('objective:'.length))
              : graph.cards.some((c) => c.key === sel.key);
      if (!alive) untracked(() => this.selection.set(null));
    });

    // The link menu and the toolbar's question belong to the selected node: selecting something else (or nothing) closes them.
    effect(() => {
      const selected = this.selectedKey();
      untracked(() => {
        if (this.menuKey() !== null && this.menuKey() !== selected) this.menuKey.set(null);
        if (this.pending() !== null && this.pending()!.key !== selected) this.pending.set(null);
      });
    });

    const destroyRef = inject(DestroyRef);
    if (typeof matchMedia === 'function') {
      const query = matchMedia(COMPACT);
      const onChange = () => this.compact.set(query.matches);
      query.addEventListener('change', onChange);
      destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
    }
    afterNextRender(
      () => {
        const el = this.viewportEl().nativeElement;
        const observer = new ResizeObserver(() => {
          const before = this.viewSize();
          const view = this.viewport();
          const next = { w: el.clientWidth, h: el.clientHeight };
          this.viewSize.set(next);
          if (this.fitMode) {
            // The first measure can be 0 or a sliver (the lazy view is still laying out): fitting again follows every size.
            this.fit(true);
          } else if (before.w && before.h && next.w && next.h) {
            // A manual view keeps the world point at the centre of the canvas where it was (the clamp does the rest).
            this.rawViewport.set({ ...view, x: view.x + (next.w - before.w) / 2, y: view.y + (next.h - before.h) / 2 });
          }
        });
        observer.observe(el);
        destroyRef.onDestroy(() => observer.disconnect());
      },
      { injector: this.injector },
    );
    destroyRef.onDestroy(() => {
      if (this.saveTimer) this.saveViewport();
      clearTimeout(this.refusalTimer);
    });
  }

  // ---- viewport control (also driven by the toolbar) -------------------------------------------------------

  private restoreViewport(id: string): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const stored = this.storedViewports()[id];
    if (stored && [stored.x, stored.y, stored.k].every(Number.isFinite)) {
      // Clamped on read (the computed), so a view stored on a wide screen opens sanely on a narrow one.
      this.rawViewport.set({ x: stored.x, y: stored.y, k: clampZoom(stored.k) });
      this.fitMode = stored.fit === true;
    } else {
      this.rawViewport.set(DEFAULT_VIEWPORT);
      this.fitMode = true;
    }
    if (this.fitMode) afterNextRender(() => this.fitMode && this.fit(true), { injector: this.injector });
  }

  /** A viewport the user chose (pan, zoom): kept inside the diagram, remembered, and fit mode ends. */
  private setViewport(viewport: Viewport): void {
    this.fitMode = false;
    const size = this.viewSize();
    this.rawViewport.set(size.w ? clampViewport(viewport, this.bounds(), size.w, size.h) : viewport);
    this.scheduleSave();
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveViewport(), 250);
  }

  private saveViewport(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const { x, y, k } = this.viewport();
    const id = this.projectId();
    const entry: StoredViewport = { x: Math.round(x), y: Math.round(y), k: Math.round(k * 1000) / 1000, ...(this.fitMode ? { fit: true as const } : {}) };
    this.storedViewports.update((all) => ({ ...all, [id]: entry }));
  }

  /** Zooms by `factor` around the middle of the viewport. */
  zoomBy(factor: number): void {
    const el = this.viewportEl().nativeElement;
    this.setViewport(zoomAround(this.viewport(), factor, el.clientWidth / 2, el.clientHeight / 2, this.minZoom()));
  }

  zoomIn(): void {
    this.zoomBy(BUTTON_ZOOM);
  }

  zoomOut(): void {
    this.zoomBy(1 / BUTTON_ZOOM);
  }

  /**
   * Shows the whole diagram, top-aligned: every lane as it is now (a collapsed one is a thin strip), down to the
   * lowest visible card. It also turns fit mode on, so the canvas keeps fitting as it resizes. `auto` is the
   * automatic fit (first open, a resize, a lane change): applied but not remembered, so a fit made at a bad size
   * never sticks.
   */
  fit(auto = false): void {
    const el = this.viewportEl().nativeElement;
    if (!el.clientWidth || !el.clientHeight) return;
    const bounds = this.bounds();
    // Keep the fitted diagram clear of the controls cluster floating over the bottom-left corner.
    const controls = el.parentElement?.querySelector<HTMLElement>('.flow-canvas__controls');
    const insetLeft = controls ? controls.getBoundingClientRect().right - el.getBoundingClientRect().left : 0;
    this.fitMode = true;
    this.rawViewport.set(fitViewport(bounds, el.clientWidth, el.clientHeight, 16, Math.max(0, insetLeft), 'top'));
    if (!auto) this.scheduleSave();
  }

  /** Back to 100%, around the middle of the canvas. */
  resetZoom(): void {
    this.zoomBy(1 / this.viewport().k);
  }

  // ---- the controls cluster ----------------------------------------------------------------------------------

  /** The cluster's ⋯ menu (Tidy up, Reset zoom) is open. */
  protected readonly controlsMenu = signal(false);
  /** Tidy up is asking before it forgets hand-placed positions (there is no undo). */
  protected readonly tidyAsk = signal(false);
  private readonly controlsMore = viewChild<ElementRef<HTMLElement>>('controlsMore');
  private readonly controlsRoot = viewChild<ElementRef<HTMLElement>>('controlsRoot');

  protected toggleControlsMenu(): void {
    if (this.controlsMenu()) {
      this.closeControlsMenu(true);
      return;
    }
    this.tidyAsk.set(false);
    this.controlsMenu.set(true);
    afterNextRender(() => this.controlsRoot()?.nativeElement.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }), { injector: this.injector });
  }

  protected closeControlsMenu(restoreFocus: boolean): void {
    if (!this.controlsMenu()) return;
    this.controlsMenu.set(false);
    this.tidyAsk.set(false);
    if (restoreFocus) this.controlsMore()?.nativeElement.focus({ preventScroll: true });
  }

  /** Tidy up from the menu: asks inline first when there is something to forget, else just does it. */
  protected requestTidy(): void {
    const positions = this.storedLayout()?.positions;
    if (positions && Object.keys(positions).length) {
      this.tidyAsk.set(true);
      afterNextRender(() => this.controlsRoot()?.nativeElement.querySelector<HTMLElement>('[data-confirm-first]')?.focus({ preventScroll: true }), { injector: this.injector });
    } else {
      this.tidyUp();
    }
  }

  protected cancelTidy(): void {
    this.tidyAsk.set(false);
    afterNextRender(() => this.controlsRoot()?.nativeElement.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }), { injector: this.injector });
  }

  /** Forgets the hand-placed positions and fits the result. */
  protected tidyUp(): void {
    this.flow.clearPositions(this.projectId());
    this.drag.set(null);
    this.pending.set(null);
    this.fit();
    this.closeControlsMenu(true);
  }

  protected onResetZoomItem(): void {
    this.resetZoom();
    this.closeControlsMenu(true);
  }

  protected onControlsKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.controlsMenu()) {
      // One question or menu at a time, and never the project view's "back".
      event.preventDefault();
      event.stopPropagation();
      if (this.tidyAsk()) this.cancelTidy();
      else this.closeControlsMenu(true);
      return;
    }
    if (!this.controlsMenu() || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    const items = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  }

  /** Tabbing or clicking out of the cluster closes its menu. */
  protected onControlsFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (this.controlsMenu() && next && !this.controlsRoot()?.nativeElement.contains(next)) this.closeControlsMenu(false);
  }

  // ---- pointer gestures ------------------------------------------------------------------------------------

  private toWorld(event: { clientX: number; clientY: number }): Point {
    const rect = this.viewportEl().nativeElement.getBoundingClientRect();
    const v = this.viewport();
    return { x: (event.clientX - rect.left - v.x) / v.k, y: (event.clientY - rect.top - v.y) / v.k };
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      // A second finger turns whatever the first was doing into a pinch.
      if (this.touches.size === 2) {
        this.startPinch();
        return;
      }
    }
    if (this.pinch || this.gesture) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[data-unlink]')) return;
    // Buttons, the quick-add input inside a card, the link menu and the floating controls keep their normal behaviour.
    if (target.closest('button, input, textarea, select, a, [data-menu], [data-ui]')) return;

    // Keep keyboard focus on the canvas (Delete, Enter, arrows) and avoid text selection.
    event.preventDefault();
    this.viewportEl().nativeElement.focus({ preventScroll: true });

    const linkEl = target.closest<HTMLElement>('[data-link-id]');
    if (linkEl) {
      this.selection.set({ kind: 'link', id: linkEl.dataset['linkId']! });
      return;
    }

    const base = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    // The port element, or failing that whichever port is within reach of the press: a small dot is hard to hit.
    const portEl = target.closest<HTMLElement>('[data-port]');
    const port = portEl ? { kind: portEl.dataset['portKind'] as FlowSource['kind'], id: portEl.dataset['portId']! } : this.portNear(this.toWorld(event));
    if (port) {
      const { kind, id } = port;
      const source: FlowSource = kind === 'objective' ? { kind, id } : { kind, id, projectId: this.projectId() };
      const from = this.portPoint(kind, id);
      if (!from) return;
      this.gesture = { ...base, kind: 'link', source, from };
      return;
    }

    const grip = target.closest<HTMLElement>('[data-drag]');
    if (grip?.dataset['drag'] === 'task') {
      const taskId = grip.dataset['taskId']!;
      this.selection.set({ kind: 'node', key: taskKey(taskId) });
      this.gesture = { ...base, kind: 'task', taskId };
      return;
    }
    if (grip) {
      const key = grip.closest<HTMLElement>('[data-key]')?.dataset['key'];
      if (key) {
        this.selection.set({ kind: 'node', key });
        this.gesture = { ...base, kind: 'node', key, origin: this.posOf(key) };
        return;
      }
    }
    const keyed = target.closest<HTMLElement>('[data-key]');
    if (keyed) {
      this.selection.set({ kind: 'node', key: keyed.dataset['key']! });
      return;
    }
    this.gesture = { ...base, kind: 'pan', origin: this.viewport() };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.touches.has(event.pointerId)) this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pinch) {
      this.updatePinch();
      return;
    }
    const g = this.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      g.moved = true;
      this.viewportEl().nativeElement.setPointerCapture(event.pointerId);
      if (g.kind === 'pan') this.panning.set(true);
      if (g.kind === 'link') this.linkSource.set(g.source);
    }
    switch (g.kind) {
      case 'pan':
        this.setViewport({ ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy });
        break;
      case 'node': {
        const k = this.viewport().k;
        this.drag.set({ key: g.key, pos: { x: g.origin.x + dx / k, y: Math.max(LANE_TOP, g.origin.y + dy / k) } });
        break;
      }
      case 'task': {
        const world = this.toWorld(event);
        const todo = this.projectTodos().find((t) => t.id === g.taskId);
        this.taskDrag.set({ id: g.taskId, title: todo?.title ?? '', pos: world, over: this.cardAt(world)?.key ?? null });
        break;
      }
      case 'link': {
        const world = this.toWorld(event);
        this.linkPreview.set({ from: g.from, to: world, hover: this.objectiveAt(world)?.id ?? null });
        break;
      }
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    this.releaseTouch(event.pointerId);
    const g = this.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    this.gesture = null;
    const el = this.viewportEl().nativeElement;
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    const world = this.toWorld(event);
    switch (g.kind) {
      case 'pan':
        this.panning.set(false);
        // A click on the bare canvas deselects; a pan keeps the selection.
        if (!g.moved) this.selection.set(null);
        break;
      case 'node': {
        const drag = this.drag();
        this.drag.set(null);
        if (g.moved && drag) this.commitMove(g.key, drag.pos);
        break;
      }
      case 'task': {
        const over = this.taskDrag()?.over ?? this.cardAt(world)?.key ?? null;
        this.taskDrag.set(null);
        if (g.moved && over) this.commitTaskMove(g.taskId, over);
        break;
      }
      case 'link': {
        this.linkSource.set(null);
        this.linkPreview.set(null);
        const target = g.moved ? this.objectiveAt(world) : undefined;
        if (target) {
          const refused = this.flow.link(g.source, target.id);
          if (refused) this.flashRefusal(target.id, refused);
        }
        break;
      }
    }
  }

  protected onPointerCancel(event: PointerEvent): void {
    this.releaseTouch(event.pointerId);
    this.cancelGesture();
  }

  private releaseTouch(pointerId: number): void {
    this.touches.delete(pointerId);
    // The finger left over after a pinch does nothing until it lifts: it has no gesture to continue.
    if (this.pinch && this.touches.size < 2) {
      this.pinch = null;
      this.pinching.set(false);
    }
  }

  /** Two fingers down: drop the one-finger gesture and remember the starting distance, midpoint and viewport. */
  private startPinch(): void {
    const [a, b] = [...this.touches.values()];
    this.cancelGesture();
    this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: this.toLocal({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), origin: this.viewport() };
    this.pinching.set(true);
  }

  /** Zooms by the change in finger distance around the midpoint, and pans with the midpoint. */
  private updatePinch(): void {
    const pinch = this.pinch;
    const [a, b] = [...this.touches.values()];
    if (!pinch || !a || !b) return;
    const mid = this.toLocal({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const k = clampZoom(pinch.origin.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), this.minZoom());
    const ratio = k / pinch.origin.k;
    this.setViewport({ x: mid.x - (pinch.mid.x - pinch.origin.x) * ratio, y: mid.y - (pinch.mid.y - pinch.origin.y) * ratio, k });
  }

  /** Client coordinates to the canvas's own (screen pixels from its top-left corner). */
  private toLocal(client: Point): Point {
    const rect = this.viewportEl().nativeElement.getBoundingClientRect();
    return { x: client.x - rect.left, y: client.y - rect.top };
  }

  /** The port within `PORT_REACH` screen pixels of a world point (nearest wins), or null. */
  private portNear(world: Point): { kind: FlowSource['kind']; id: string } | null {
    const reach = PORT_REACH / this.viewport().k;
    let best: { kind: FlowSource['kind']; id: string } | null = null;
    let bestDistance = Infinity;
    const consider = (kind: FlowSource['kind'], id: string, at: Point, halfHeight: number) => {
      const dx = Math.abs(world.x - at.x);
      const dy = Math.abs(world.y - at.y);
      if (dx > reach || dy > Math.min(reach, halfHeight)) return;
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { kind, id };
      }
    };
    for (const card of this.renderedCards()) {
      const pos = this.posOf(card.key);
      if (card.milestone) consider('milestone', card.milestone.id, headerPort(pos), HEADER_HEIGHT / 2);
      if (this.isCollapsed(card)) continue;
      card.rows.forEach((task, index) => consider('task', task.id, rowPort(pos, index), ROW_HEIGHT / 2));
    }
    for (const objective of this.renderedObjectives()) consider('objective', objective.id, objectiveOutPort(this.posOf(objectiveKey(objective.id))), OBJECTIVE_HEIGHT / 2);
    return best;
  }

  private cancelGesture(): void {
    this.gesture = null;
    this.drag.set(null);
    this.taskDrag.set(null);
    this.linkSource.set(null);
    this.linkPreview.set(null);
    this.panning.set(false);
  }

  /** The port's world position, for the start of a link drag. */
  private portPoint(kind: FlowSource['kind'], id: string): Point | null {
    const graph = this.graph();
    if (kind === 'objective') return objectiveOutPort(this.posOf(objectiveKey(id)));
    if (kind === 'milestone') return headerPort(this.posOf(milestoneKey(id)));
    const cardKey = graph.cardOfTask.get(id);
    const row = graph.rowOfTask.get(id);
    return cardKey !== undefined && row !== undefined ? rowPort(this.posOf(cardKey), row) : null;
  }

  private objectiveAt(world: Point): Objective | undefined {
    return this.objectives().find((o) => rectContains(objectiveRect(this.posOf(objectiveKey(o.id))), world, 6));
  }

  private cardAt(world: Point): WorkCard | undefined {
    return this.graph().cards.find((c) => rectContains(workCardRect(this.posOf(c.key), this.heightOf(c)), world));
  }

  /**
   * Drops a card at `pos`: Work cards keep their lane; an objective dropped in another (open) horizon lane
   * changes horizon. When that would drop objective links the card waits where it was dropped and the toolbar
   * asks first (`pending`); a collapsed lane is not a drop target.
   */
  private commitMove(key: string, pos: Point): void {
    const projectId = this.projectId();
    const lanes = this.lanes();
    if (!key.startsWith('objective:')) {
      this.flow.setPosition(projectId, key, cardX('work', lanes), pos.y);
      return;
    }
    const id = key.slice('objective:'.length);
    const objective = this.graph().objectives.find((o) => o.id === id);
    if (!objective) return;
    const horizon = this.horizonAt(pos.x + OBJECTIVE_WIDTH / 2) ?? objective.horizon;
    if (horizon !== objective.horizon && this.horizonChangeBreaksLinks(objective, horizon)) {
      this.selection.set({ kind: 'node', key });
      this.pending.set({ kind: 'horizon', key, horizon, pos: { x: cardX(horizon, lanes), y: pos.y } });
      return;
    }
    this.applyMove(objective, horizon, pos.y);
  }

  private applyMove(objective: Objective, horizon: Horizon, y: number): void {
    if (horizon !== objective.horizon) this.flow.updateObjective(objective.id, { horizon });
    this.flow.setPosition(this.projectId(), objectiveKey(objective.id), cardX(horizon, this.lanes()), y);
  }

  /** A new horizon drops the objective links that would no longer point to a longer horizon. */
  private horizonChangeBreaksLinks(objective: Objective, horizon: Horizon): boolean {
    const byId = new Map(this.graph().objectives.map((o) => [o.id, o]));
    return this.graph().links.some((l) => {
      if (l.fromKind !== 'objective') return false;
      if (l.fromId === objective.id) return !isLongerHorizon(horizon, byId.get(l.toObjectiveId)!.horizon);
      if (l.toObjectiveId === objective.id) return !isLongerHorizon(byId.get(l.fromId)!.horizon, horizon);
      return false;
    });
  }

  private commitTaskMove(taskId: string, cardKey: string): void {
    const graph = this.graph();
    if (graph.cardOfTask.get(taskId) === cardKey) return;
    const card = graph.cards.find((c) => c.key === cardKey);
    if (card) this.todos.updateTodo(taskId, { milestoneId: card.milestone?.id });
  }

  private flashRefusal(id: string, reason: LinkRefusal): void {
    this.refusal.set({ id, reason });
    clearTimeout(this.refusalTimer);
    this.refusalTimer = setTimeout(() => this.refusal.set(null), 2200);
  }

  // ---- wheel, double-click, keyboard -----------------------------------------------------------------------

  protected onWheel(event: WheelEvent): void {
    // The link menu scrolls itself; the floating controls and toolbar are not part of the diagram.
    if ((event.target as Element).closest('[data-menu], [data-ui]')) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const v = this.viewport();
    if (event.ctrlKey || event.metaKey) {
      // A trackpad pinch arrives as small Ctrl+wheel deltas, a mouse wheel as big ones.
      const dy = event.deltaY * unit;
      const speed = Math.abs(dy) < 50 ? 0.01 : 0.0015;
      const rect = this.viewportEl().nativeElement.getBoundingClientRect();
      this.setViewport(zoomAround(v, Math.exp(-dy * speed), event.clientX - rect.left, event.clientY - rect.top, this.minZoom()));
      return;
    }
    let dx = event.deltaX * unit;
    let dy = event.deltaY * unit;
    if (event.shiftKey && !dx) [dx, dy] = [dy, 0];
    this.setViewport({ ...v, x: v.x - dx, y: v.y - dy });
  }

  protected onDblClick(event: MouseEvent): void {
    const target = event.target as Element;
    if (target.closest('button, input, textarea, select, [data-port], [data-unlink], [data-link-id], [data-menu], [data-ui]')) return;
    const key = target.closest<HTMLElement>('[data-key]')?.dataset['key'];
    if (key) {
      this.openEditor(key);
      return;
    }
    const world = this.toWorld(event);
    const horizon = this.horizonAt(world.x);
    if (horizon) this.createObjective.emit({ horizon, y: Math.max(LANE_TOP, world.y - OBJECTIVE_HEIGHT / 2) });
  }

  private openEditor(key: string): void {
    const sep = key.indexOf(':');
    const kind = key.slice(0, sep);
    const id = key.slice(sep + 1);
    if (kind === 'objective') this.editObjective.emit(id);
    else if (kind === 'milestone') this.editMilestone.emit(id);
    else if (kind === 'task') this.editTask.emit(id);
  }

  /** Tab onto a card selects it, so keyboard users get the same chain highlight. */
  protected onFocusIn(event: FocusEvent): void {
    const target = event.target as Element;
    const key = target instanceof HTMLElement && target.matches('[data-key]') ? target.dataset['key'] : undefined;
    if (key) this.selection.set({ kind: 'node', key });
  }

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as Element;
    // The link menu, the toolbar and the floating controls run their own keys.
    if (target.closest('input, textarea, select, [data-menu], [data-ui]')) return;
    const viewportEl = this.viewportEl().nativeElement;
    // A dialog opened over the canvas (a shortcut, the FAB) may leave focus here for a moment; its keys are not
    // ours. Focus mode is itself an aria-modal that contains the canvas, so it does not count.
    if (Array.from(document.querySelectorAll('[aria-modal="true"]')).some((el) => !el.contains(viewportEl))) return;
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.startsWith('Arrow')) {
      // Alt + arrows move the selected card. Alt + Left is also the detail view's "back", so a handled key must not reach it.
      const key = target.closest<HTMLElement>('[data-key]')?.dataset['key'] ?? this.selectedKey();
      if (key && !key.startsWith('task:')) {
        event.preventDefault();
        event.stopPropagation();
        this.moveByKey(key, event.key, event.shiftKey);
      }
      return;
    }
    switch (event.key) {
      case 'l':
      case 'L':
      case 'ContextMenu':
      case 'F10':
        if (event.key === 'F10' && !event.shiftKey) return;
        if (event.ctrlKey || event.metaKey || (event.key !== 'ContextMenu' && event.altKey)) return;
        if (target.closest('button')) return;
        if (this.openMenu()) event.preventDefault();
        break;
      case 'Delete':
      case 'Backspace': {
        const id = this.selectedLinkId();
        const key = this.selectedKey();
        if (id) {
          event.preventDefault();
          this.unlink(id);
        } else if (key?.startsWith('objective:') && plain && !target.closest('button')) {
          // Never deletes straight away: the toolbar asks first.
          event.preventDefault();
          this.askDeleteObjective(key);
        }
        break;
      }
      case 'e':
      case 'E': {
        const key = this.selectedKey();
        if (!key || !plain || target.closest('button')) return;
        event.preventDefault();
        this.openEditor(key);
        break;
      }
      case 'a':
      case 'A': {
        const key = this.selectedKey();
        if (!key?.startsWith('objective:') || !plain || target.closest('button')) return;
        event.preventDefault();
        this.toggleAchieved(key);
        break;
      }
      case 'Enter': {
        if (target.closest('button')) return;
        const key = target.closest<HTMLElement>('[data-key]')?.dataset['key'] ?? this.selectedKey();
        if (key) {
          event.preventDefault();
          this.openEditor(key);
        }
        break;
      }
      case 'Escape':
        // Only swallow it when it cancels something, so a bare Escape still leaves the project. A question goes
        // first, then the selection.
        if (this.pending()) {
          event.preventDefault();
          this.cancelPending();
        } else if (this.gesture || this.selection()) {
          event.preventDefault();
          this.cancelGesture();
          this.selection.set(null);
        }
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (target !== viewportEl || event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        const v = this.viewport();
        const step = event.shiftKey ? KEY_PAN * 3 : KEY_PAN;
        this.setViewport({
          ...v,
          x: v.x + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0),
          y: v.y + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
        });
        break;
      }
      case '+':
      case '=':
        if (target === viewportEl) this.zoomIn();
        break;
      case '-':
        if (target === viewportEl) this.zoomOut();
        break;
      case '0':
        if (plain && !target.closest('button')) {
          event.preventDefault();
          this.resetZoom();
        }
        break;
      case '1':
        if (plain && !target.closest('button')) {
          event.preventDefault();
          this.fit();
        }
        break;
    }
  }

  // ---- keyboard moves and the link menu --------------------------------------------------------------------

  /**
   * Alt + arrow on a card: up and down step its y by 8 world pixels (32 with Shift); an objective's left and
   * right jump to the neighbouring open horizon lane (a lane is 380 wide, so pixel steps there would do nothing).
   * Work cards never leave their lane. Each press commits like a finished drag.
   */
  private moveByKey(key: string, arrow: string, big: boolean): void {
    const pos = this.posOf(key);
    const step = KEY_MOVE * (big ? 4 : 1);
    if (arrow === 'ArrowUp' || arrow === 'ArrowDown') {
      this.commitMove(key, { x: pos.x, y: Math.max(LANE_TOP, pos.y + (arrow === 'ArrowUp' ? -step : step)) });
      return;
    }
    if (!key.startsWith('objective:')) return;
    const objective = this.graph().objectives.find((o) => o.id === key.slice('objective:'.length));
    if (!objective) return;
    // The neighbouring horizon that is open: a collapsed strip is skipped, not a place to drop into.
    const direction = arrow === 'ArrowLeft' ? -1 : 1;
    const open = (h: Horizon) => !this.lanes().find((l) => l.key === h)?.collapsed;
    let index = HORIZONS.indexOf(objective.horizon) + direction;
    while (index >= 0 && index < HORIZONS.length && !open(HORIZONS[index])) index += direction;
    if (index >= 0 && index < HORIZONS.length) this.commitMove(key, { x: cardX(HORIZONS[index], this.lanes()), y: pos.y });
  }

  /** Opens the link menu for the selected node. Returns false when there is nothing linkable selected. */
  protected openMenu(): boolean {
    const key = this.selectedKey();
    if (!key || !this.sourceOf(key)) return false;
    this.menuKey.set(key);
    return true;
  }

  protected closeMenu(restoreFocus: boolean): void {
    const key = this.menuKey();
    if (key === null) return;
    this.menuKey.set(null);
    if (restoreFocus) this.focusNode(key);
  }

  /** Focus goes back to the card when it is focusable (a task row is not), else to the canvas. */
  private focusNode(key: string): void {
    const viewportEl = this.viewportEl().nativeElement;
    const card = Array.from(viewportEl.querySelectorAll<HTMLElement>('[data-key][tabindex]')).find((el) => el.dataset['key'] === key);
    (card ?? viewportEl).focus({ preventScroll: true });
  }

  // ---- the selection toolbar -----------------------------------------------------------------------------------

  protected onBarAction(action: BarAction): void {
    const key = this.selectedKey();
    if (!key) return;
    switch (action) {
      case 'edit':
      case 'open':
        this.openEditor(key);
        break;
      case 'link':
        if (this.menuKey()) this.closeMenu(true);
        else this.openMenu();
        break;
      case 'status':
        this.toggleAchieved(key);
        break;
      case 'collapse': {
        const card = this.graph().cards.find((c) => c.key === key);
        if (card) this.toggleCollapse(card);
        break;
      }
      case 'delete':
        this.askDeleteObjective(key);
        break;
    }
  }

  /** The committing answer of the toolbar's question. */
  protected onBarConfirmed(): void {
    const pending = this.pending();
    if (!pending) return;
    this.pending.set(null);
    const id = pending.key.slice('objective:'.length);
    const objective = this.graph().objectives.find((o) => o.id === id);
    if (pending.kind === 'delete') {
      this.flow.removeObjective(id);
      this.selection.set(null);
      this.viewportEl().nativeElement.focus({ preventScroll: true });
    } else if (objective) {
      this.applyMove(objective, pending.horizon, pending.pos.y);
      this.focusNode(pending.key);
    }
  }

  /** The safe answer: the card goes back where it was and the question closes. */
  protected cancelPending(): void {
    const pending = this.pending();
    if (!pending) return;
    this.pending.set(null);
    this.focusNode(pending.key);
  }

  protected onBarDismissed(): void {
    this.selection.set(null);
    this.viewportEl().nativeElement.focus({ preventScroll: true });
  }

  private askDeleteObjective(key: string): void {
    this.closeMenu(false);
    this.pending.set({ kind: 'delete', key });
  }

  private toggleAchieved(key: string): void {
    const objective = this.graph().objectives.find((o) => objectiveKey(o.id) === key);
    if (objective) this.flow.updateObjective(objective.id, { status: objective.status === 'achieved' ? 'active' : 'achieved' });
  }

  protected hideLane(horizon: Horizon): void {
    this.state.setHorizonHidden(horizon, true);
  }

  protected showLane(horizon: Horizon): void {
    this.state.setHorizonHidden(horizon, false);
  }

  protected dismissTip(): void {
    this.state.linkTipDismissed.set(true);
  }

  /** Links exist in the project: the "drag from the port" tip has done its job. */
  protected readonly showTip = computed(
    () => this.graph().objectives.length > 0 && (this.flow.linksByProject().get(this.projectId())?.length ?? 0) === 0 && this.state.linkTipDismissed() !== true,
  );

  // ---- card actions ----------------------------------------------------------------------------------------

  protected unlink(id: string): void {
    this.flow.unlink(id);
    this.selection.set(null);
  }

  protected toggleCollapse(card: WorkCard): void {
    const collapse = !this.collapsedKeys().has(card.key);
    this.flow.setCollapsed(this.projectId(), card.key, collapse);
    if (!collapse) this.settleBelow(card.key);
  }

  protected addTask(card: WorkCard, title: string): void {
    this.todos.addTodo({
      title,
      importance: 'medium',
      urgency: 'medium',
      tags: [],
      projectId: this.projectId(),
      milestoneId: card.milestone?.id,
    });
    this.settleBelow(card.key);
  }

  /**
   * A card that grew (a task added, the card expanded) may now cover the hand-placed card below it. Once the
   * new height is laid out, those cards are pushed down just far enough. Cards without a stored position
   * restack by themselves and positions that are not in the way are left alone.
   */
  private settleBelow(cardKey: string): void {
    afterNextRender(
      () => {
        const { positions, heights } = this.placement();
        const stored = this.storedLayout()?.positions ?? {};
        const cards = this.graph().cards.flatMap((c) => {
          const pos = positions.get(c.key);
          return pos ? [{ key: c.key, y: pos.y, h: heights.get(c.key) ?? 0, stored: c.key in stored }] : [];
        });
        const pushed = pushDownOverlaps(cards, cardKey);
        if (!pushed.size) return;
        this.flow.setPositions(
          this.projectId(),
          Object.fromEntries([...pushed].map(([key, y]) => [key, { x: cardX('work'), y }])),
        );
      },
      { injector: this.injector },
    );
  }

  protected isCollapsed(card: WorkCard): boolean {
    return this.collapsedKeys().has(card.key);
  }
}
