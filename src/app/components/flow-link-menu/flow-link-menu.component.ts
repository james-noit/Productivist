import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { horizonRank, validTargets, type FlowSource } from '../../../lib/flow-rules';
import { FlowService } from '../../../services/flow.service';
import type { Horizon } from '../../../types/flow';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * The keyboard and touch way to link: the objectives a task, milestone or objective may feed, and the
 * links it already has (each removable), as a small panel of buttons. The Outline rows and the diagram's
 * selected node both open it. It changes the store itself, closes after a change, and reports whether focus
 * should go back to what opened it (Escape and a finished action yes, focus simply leaving no). For an objective
 * the Outline also passes `deletable`: a last *Delete objective* entry that asks inline ("Delete this objective? Its
 * links are removed.") before `deleted` is emitted; the store removes the objective and its links.
 */
@Component({
  selector: 'app-flow-link-menu',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-link-menu.component.html',
  styleUrl: './flow-link-menu.component.css',
  host: {
    role: 'dialog',
    tabindex: '-1',
    'data-menu': '',
    '[attr.aria-label]': 'title()',
    '(keydown)': 'onKeydown($event)',
    '(focusout)': 'onFocusOut($event)',
    // Clicking inside must not move focus out of the panel, or the focusout would close it before the click lands.
    '(mousedown)': '$event.preventDefault()',
  },
})
export class FlowLinkMenuComponent {
  private readonly flow = inject(FlowService);
  private readonly translate = inject(TranslateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly source = input.required<FlowSource>();
  /** Name of the thing being linked, for the heading. */
  readonly label = input.required<string>();
  /** Offers deleting the source objective (the Outline's rows; the diagram has its own toolbar for it). */
  readonly deletable = input(false);
  /** `true` when focus should return to whatever opened the menu. */
  readonly closed = output<boolean>();
  /** The objective was deleted from the inline question. */
  readonly deleted = output<void>();

  protected readonly message = signal('');
  protected readonly confirming = signal(false);

  protected readonly title = computed(() => this.translate.instant('flow.link.title', { name: this.label() }));

  /** Objectives the source may be linked to now, shortest horizon first. */
  protected readonly targets = computed(() =>
    validTargets(this.flow.objectives(), this.flow.links(), this.source())
      .sort((a, b) => horizonRank(a.horizon) - horizonRank(b.horizon) || a.order - b.order)
      .map((o) => ({ id: o.id, title: o.title, horizon: o.horizon as Horizon })),
  );

  /** The source's existing links with their objectives' titles. */
  protected readonly linked = computed(() => {
    const { kind, id } = this.source();
    const byId = new Map(this.flow.objectives().map((o) => [o.id, o]));
    const out: { linkId: string; title: string; horizon: Horizon }[] = [];
    for (const link of this.flow.links()) {
      const objective = link.fromKind === kind && link.fromId === id ? byId.get(link.toObjectiveId) : undefined;
      if (objective) out.push({ linkId: link.id, title: objective.title, horizon: objective.horizon });
    }
    return out;
  });

  constructor() {
    afterNextRender(
      () => {
        const first = this.items()[0];
        (first ?? this.host.nativeElement).focus();
      },
      { injector: this.injector },
    );
  }

  private items(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('button'));
  }

  protected link(objectiveId: string): void {
    const refused = this.flow.link(this.source(), objectiveId);
    if (refused) this.message.set(this.translate.instant(`flow.refusals.${refused}`));
    else this.closed.emit(true);
  }

  protected unlink(linkId: string): void {
    this.flow.unlink(linkId);
    this.closed.emit(true);
  }

  /** Swaps the list for the inline question; focus stays inside the panel so its focusout does not close it. */
  protected askDelete(): void {
    this.host.nativeElement.focus();
    this.confirming.set(true);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-confirm-first]')?.focus(), { injector: this.injector });
  }

  protected keepObjective(): void {
    this.host.nativeElement.focus();
    this.confirming.set(false);
    afterNextRender(() => this.items()[0]?.focus(), { injector: this.injector });
  }

  protected deleteObjective(): void {
    const { kind, id } = this.source();
    if (kind !== 'objective') return;
    this.flow.removeObjective(id);
    this.deleted.emit();
    this.closed.emit(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Must not also leave the project (the detail view's Escape handler) or clear the diagram selection.
      event.preventDefault();
      event.stopPropagation();
      // An open question is answered "keep" first; the menu itself closes on the next Escape.
      if (this.confirming()) this.keepObjective();
      else this.closed.emit(true);
      return;
    }
    const items = this.items();
    const index = items.indexOf(event.target as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next >= 0 && items.length) {
      event.preventDefault();
      event.stopPropagation();
      items[next].focus();
    }
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this.host.nativeElement.contains(next)) this.closed.emit(false);
  }
}
