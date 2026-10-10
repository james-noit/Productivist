import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ADD_ROW_HEIGHT, HEADER_HEIGHT, ROW_HEIGHT, WORK_CARD_WIDTH, type Point } from '../../../lib/flow-geometry';
import type { WorkCard } from '../../../lib/flow-graph';

/**
 * A card of the Work lane: a milestone with its tasks as rows, or the "No milestone" card of the tasks that
 * have none (same look, but its header has no port: "everything without a milestone" is not something to
 * link). Presentational like the objective card: the canvas runs the drag, link and selection gestures
 * through the `data-*` attributes below; the card only reports collapsing and quick-adding a task.
 */
@Component({
  selector: 'app-flow-milestone-node',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-milestone-node.component.html',
  styleUrl: './flow-milestone-node.component.css',
  host: {
    role: 'group',
    tabindex: '0',
    '[attr.data-key]': 'card().key',
    '[attr.aria-label]': 'label()',
    '[class]': 'hostClass()',
    '[style.width.px]': 'width',
    '[style.height.px]': 'height()',
    '[style.transform]': 'transform()',
  },
})
export class FlowMilestoneNodeComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly card = input.required<WorkCard>();
  readonly position = input.required<Point>();
  readonly height = input.required<number>();
  readonly collapsed = input(false);
  /** Node keys of the selected chain; null when nothing is selected. */
  readonly highlight = input<ReadonlySet<string> | null>(null);
  /** Key of the selected node (this card or one of its rows). */
  readonly selectedKey = input<string | null>(null);
  /** A task row is being dragged and this card is under it. */
  readonly dropTarget = input(false);
  readonly dragging = input(false);

  readonly toggleCollapse = output<void>();
  readonly addTask = output<string>();

  protected readonly width = WORK_CARD_WIDTH;
  protected readonly headerHeight = HEADER_HEIGHT;
  protected readonly rowHeight = ROW_HEIGHT;
  protected readonly addRowHeight = ADD_ROW_HEIGHT;

  protected readonly adding = signal(false);
  protected readonly draft = signal('');

  protected readonly transform = computed(() => `translate(${this.position().x}px, ${this.position().y}px)`);

  protected readonly label = computed(() => {
    const card = this.card();
    return card.milestone ? `${card.milestone.name}, ${card.done}/${card.total}` : `${card.done}/${card.total}`;
  });

  protected readonly dimmed = computed(() => {
    const lit = this.highlight();
    return !!lit && !lit.has(this.card().key);
  });

  protected readonly hostClass = computed(() => {
    const classes = ['flow-node', 'flow-node--work'];
    if (!this.card().milestone) classes.push('flow-node--loose');
    if (this.selectedKey() === this.card().key) classes.push('flow-node--selected');
    if (this.dimmed()) classes.push('flow-node--dimmed');
    if (this.dropTarget()) classes.push('flow-node--drop');
    if (this.dragging()) classes.push('flow-node--dragging');
    return classes.join(' ');
  });

  protected rowClass(taskId: string, done: boolean): string {
    const key = `task:${taskId}`;
    const lit = this.highlight();
    const classes = ['flow-milestone__row'];
    if (done) classes.push('flow-milestone__row--done');
    if (this.selectedKey() === key) classes.push('flow-milestone__row--selected');
    else if (lit && !lit.has(key)) classes.push('flow-milestone__row--dimmed');
    return classes.join(' ');
  }

  protected startAdding(): void {
    this.adding.set(true);
    this.draft.set('');
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLInputElement>('.flow-milestone__input')?.focus(), {
      injector: this.injector,
    });
  }

  protected submit(): void {
    const title = this.draft().trim();
    if (!title) return;
    this.addTask.emit(title);
    this.draft.set('');
  }

  protected cancelAdding(event?: Event): void {
    // Escape here must not also leave the project (the detail view's Escape handler).
    event?.stopPropagation();
    this.adding.set(false);
    this.draft.set('');
  }
}
