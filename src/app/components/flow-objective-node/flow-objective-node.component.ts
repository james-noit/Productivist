import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatIso, todayIso } from '../../../lib/dates';
import { OBJECTIVE_HEIGHT, OBJECTIVE_WIDTH, type Point } from '../../../lib/flow-geometry';
import type { Progress } from '../../../lib/flow-graph';
import { SettingsService } from '../../../services/settings.service';
import type { Objective } from '../../../types/flow';

/**
 * One objective card of the Flow diagram. Presentational: the canvas owns every pointer and key gesture
 * (it finds this card through its `data-key`/`data-drag`/`data-port` attributes), so the card only draws
 * itself at a fixed size.
 */
@Component({
  selector: 'app-flow-objective-node',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-objective-node.component.html',
  styleUrl: './flow-objective-node.component.css',
  host: {
    role: 'group',
    tabindex: '0',
    'data-drag': 'node',
    '[attr.data-key]': '"objective:" + objective().id',
    '[attr.aria-label]': 'label()',
    '[class]': 'hostClass()',
    '[style.width.px]': 'width',
    '[style.height.px]': 'height',
    '[style.transform]': 'transform()',
  },
})
export class FlowObjectiveNodeComponent {
  private readonly settings = inject(SettingsService);

  readonly objective = input.required<Objective>();
  readonly progress = input.required<Progress>();
  readonly position = input.required<Point>();
  readonly selected = input(false);
  /** Outside the highlighted chain of the selection. */
  readonly dimmed = input(false);
  /** While a link is dragged: can it end here? */
  readonly linkState = input<'valid' | 'invalid' | null>(null);
  /** The dragged link is over this card. */
  readonly hovered = input(false);
  /** A drop here was just refused. */
  readonly refused = input(false);
  readonly dragging = input(false);

  protected readonly width = OBJECTIVE_WIDTH;
  protected readonly height = OBJECTIVE_HEIGHT;

  private readonly dateFormat = computed(
    () => new Intl.DateTimeFormat(this.settings.language(), { day: 'numeric', month: 'short', year: 'numeric' }),
  );

  protected readonly transform = computed(() => `translate(${this.position().x}px, ${this.position().y}px)`);

  protected readonly target = computed(() => {
    const date = this.objective().targetDate;
    if (!date) return null;
    return { text: formatIso(this.dateFormat(), date), overdue: this.objective().status === 'active' && date < todayIso() };
  });

  protected readonly label = computed(() => {
    const o = this.objective();
    return `${o.title}, ${this.progress().percent}%`;
  });

  protected readonly hostClass = computed(() => {
    const classes = ['flow-node', 'flow-node--objective', `flow-node--${this.objective().horizon}`];
    if (this.selected()) classes.push('flow-node--selected');
    if (this.dimmed()) classes.push('flow-node--dimmed');
    if (this.dragging()) classes.push('flow-node--dragging');
    if (this.refused()) classes.push('flow-node--refused');
    const link = this.linkState();
    if (link) classes.push(`flow-node--link-${link}`);
    if (this.hovered()) classes.push('flow-node--hovered');
    return classes.join(' ');
  });
}
