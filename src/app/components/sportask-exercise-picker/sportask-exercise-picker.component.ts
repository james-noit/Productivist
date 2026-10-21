import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { normalizeQuery } from '../../../lib/search';
import { CATALOG } from '../../../lib/sportask/catalog';
import { localize } from '../../../lib/sportask/texts';
import { SportPanelState } from '../sportask-view/sport-panel.state';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

const MAX_ROWS = 60;

/**
 * A searchable list of the catalog's exercises (names in the active language, accent-insensitive), shown inside the template
 * editor to choose the exercise of a slot. Up/Down move between the search field and the rows, Enter picks, Escape is the
 * editor's (it closes the picker first).
 */
@Component({
  selector: 'app-sportask-exercise-picker',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-exercise-picker.component.html',
  styleUrl: './sportask-exercise-picker.component.css',
})
export class SportaskExercisePickerComponent {
  /** The exercise the slot has now (highlighted). */
  readonly current = input<string | null>(null);
  readonly picked = output<string>();
  readonly cancelled = output<void>();

  private readonly state = inject(SportPanelState);
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly query = signal('');

  /** Every usable exercise with the text it is searched by, computed once per language. */
  private readonly entries = computed(() => {
    const lang = this.state.lang();
    return CATALOG.exercises.all
      .filter((e) => !e.retired)
      .map((e) => {
        const name = localize(e.name, lang);
        const meta = [this.state.t(`panel.g.${e.pattern}`), ...(e.zones ?? []).map((z) => this.state.t(`panel.g.${z}`))].join(' · ');
        const gear = e.needsOneOf.map((id) => localize(CATALOG.equipment.get(id)?.name, lang)).join(', ');
        return { id: e.id, name, meta, gear, haystack: normalizeQuery(`${name} ${localize(e.name, lang === 'es' ? 'en' : 'es')} ${meta} ${gear}`) };
      })
      .sort((a, b) => a.name.localeCompare(b.name, lang));
  });

  protected readonly results = computed(() => {
    const terms = normalizeQuery(this.query()).split(/\s+/).filter(Boolean);
    const all = this.entries().filter((e) => terms.every((t) => e.haystack.includes(t)));
    return { rows: all.slice(0, MAX_ROWS), more: Math.max(0, all.length - MAX_ROWS) };
  });

  constructor() {
    afterNextRender(() => this.search()?.nativeElement.focus({ preventScroll: true }));
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected pickFirst(): void {
    const first = this.results().rows[0];
    if (first) this.picked.emit(first.id);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(this.list()?.nativeElement.querySelectorAll<HTMLElement>('button') ?? []);
    const input = this.search()?.nativeElement;
    if (!input) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    if (event.key === 'ArrowDown') (at < 0 ? items[0] : items[at + 1])?.focus();
    else if (at <= 0) input.focus();
    else items[at - 1]?.focus();
  }
}
