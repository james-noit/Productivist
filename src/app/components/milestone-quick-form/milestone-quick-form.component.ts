import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The one-field "New milestone" form that lives inside a menu (`project-actions-menu`, the Tasks and projects
 * context menu): a name and an add button. It takes focus when it appears. `submitted` carries the trimmed name;
 * Escape is left to the host menu unless `escapeBack` is set, in which case it is swallowed and reported through
 * `escaped` (the context menu uses that to go back a page).
 */
@Component({
  selector: 'app-milestone-quick-form',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="mqf" (submit)="$event.preventDefault(); submit()">
      <label class="field">
        <span class="field__label">{{ 'projects.card.newMilestone' | translate }}</span>
        <input
          #nameInput
          class="input"
          type="text"
          maxlength="200"
          [value]="name()"
          (input)="name.set($any($event.target).value)"
          (keydown.escape)="onEscape($event)"
          [placeholder]="'projects.milestoneNamePlaceholder' | translate"
        />
      </label>
      <button type="submit" class="btn btn--primary btn--sm" [disabled]="!name().trim()">
        {{ 'projects.addMilestone' | translate }}
      </button>
    </form>
  `,
  styles: `
    .mqf {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.4rem 0.45rem 0.45rem;
    }
  `,
})
export class MilestoneQuickFormComponent {
  readonly submitted = output<string>();
  /** Swallow Escape and report it as `escaped`, instead of letting the host menu close. */
  readonly escapeBack = input(false);
  readonly escaped = output<void>();

  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');
  readonly name = signal('');

  constructor() {
    afterNextRender(() => this.nameInput().nativeElement.focus());
  }

  submit(): void {
    const name = this.name().trim();
    if (name) this.submitted.emit(name);
  }

  onEscape(event: Event): void {
    if (!this.escapeBack()) return;
    event.stopPropagation();
    this.escaped.emit();
  }
}
