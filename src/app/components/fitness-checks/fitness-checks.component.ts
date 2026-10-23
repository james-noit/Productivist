import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { Issue } from '../../../lib/sportask/overlay/validate';
import { FitnessEditorState } from '../fitness-view/fitness-editor.state';

/** Validation of the draft: the structural list (live), and the full checks with the generation sweep (on demand and before publishing). */
@Component({
  selector: 'app-fitness-checks',
  standalone: true,
  imports: [TranslatePipe],
  host: { class: 'fd-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fitness-checks.component.html',
  styleUrl: './fitness-checks.component.css',
})
export class FitnessChecksComponent {
  protected readonly state = inject(FitnessEditorState);

  /** Errors first, then warnings; the sweep's findings are listed under the sweep. */
  protected readonly issues = computed(() => [...this.state.errors(), ...this.state.warnings()]);
  protected readonly sweep = this.state.sweep;

  protected run(): void {
    void this.state.runChecks();
  }

  protected go(issue: Issue): void {
    this.state.goTo(issue);
  }

  protected where(issue: Issue): string {
    return issue.id ? `${this.state.t(`section.${issue.section}`)} · ${issue.id}` : this.state.t(`section.${issue.section}`);
  }
}
