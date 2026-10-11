import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HORIZONS } from '../../../lib/flow-rules';
import { FlowViewState } from '../project-flow/flow-view-state';
import { SideDrawerComponent } from '../side-drawer/side-drawer.component';

/**
 * The Flow presentation's filters, in a `side-drawer`: which horizons show (the same state as the collapsible
 * lanes of the diagram), whether achieved and dropped objectives show, and whether done tasks do. Live, no
 * draft: every switch writes `FlowViewState` straight away. *Reset to defaults* goes back to the defaults,
 * *Done* closes. Rendered by `project-flow`, which provides the state.
 */
@Component({
  selector: 'app-flow-filter-drawer',
  standalone: true,
  imports: [TranslatePipe, SideDrawerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-filter-drawer.component.html',
  styleUrl: './flow-filter-drawer.component.css',
})
export class FlowFilterDrawerComponent {
  protected readonly state = inject(FlowViewState);
  protected readonly horizons = HORIZONS;
}
