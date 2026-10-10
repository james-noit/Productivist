import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { QUADRANTS, type QuadrantCounts } from '../../../lib/eisenhower';
import type { EisenhowerQuadrant } from '../../../types/eisenhower';

@Component({
  selector: 'app-quadrant-count-badges',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quadrant-count-badges.component.html',
  styleUrl: './quadrant-count-badges.component.css',
})
export class QuadrantCountBadgesComponent {
  readonly counts = input.required<QuadrantCounts>();
  /** Renders each badge as a button that emits `pick`. Off by default: most callers show plain counts. */
  readonly interactive = input(false);
  readonly pick = output<EisenhowerQuadrant>();
  readonly quadrants = QUADRANTS;
}
