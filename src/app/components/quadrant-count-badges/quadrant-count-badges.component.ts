import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { QUADRANTS, type QuadrantCounts } from '../../../lib/eisenhower';

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
  readonly quadrants = QUADRANTS;
}
