import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { Constraints } from '../../../types/sportask';

/** The limits block of Configuration > Sportask and of the setup wizard (no jumping, no floor work). Presentational. */
@Component({
  selector: 'app-sportask-limits-fields',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-limits-fields.component.html',
  styleUrl: './sportask-limits-fields.component.css',
})
export class SportaskLimitsFieldsComponent {
  readonly value = input.required<Constraints>();
  readonly changed = output<Constraints>();

  protected toggle(key: keyof Constraints): void {
    const c = this.value();
    this.changed.emit({ ...c, [key]: !c[key] });
  }
}
