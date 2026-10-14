import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  PROJECT_ICON_GROUPS,
  PROJECT_ICON_LABELS,
  PROJECT_ICONS,
} from '../../../lib/project-icon-paths';
import { normalizeQuery } from '../../../lib/search';
import { SettingsService } from '../../../services/settings.service';
import { IconComponent } from '../icon/icon.component';
import type { Project } from '../../../types/project';

interface IconOption {
  name: string;
  label: string;
}

interface IconSection {
  key: string;
  title: string;
  icons: IconOption[];
}

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [FormsModule, TranslatePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-form.component.html',
  styleUrl: './project-form.component.css',
})
export class ProjectFormComponent {
  private readonly settings = inject(SettingsService);

  readonly project = input<Project>();
  readonly save = output<{ icon: string; name: string; description: string; notes: string }>();
  readonly cancel = output<void>();

  readonly icon = linkedSignal(() => this.initial((p) => p.icon) ?? PROJECT_ICONS[0]);
  readonly name = linkedSignal(() => this.initial((p) => p.name) ?? '');
  readonly description = linkedSignal(() => this.initial((p) => p.description) ?? '');
  readonly notes = linkedSignal(() => this.initial((p) => p.notes) ?? '');

  /** The icon search text and the icon that holds the grid's tab stop (the last one focused). */
  readonly query = signal('');
  readonly focused = signal<string | null>(null);

  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');

  /** The groups with the icons that match the search (by name or by the en/es label), labelled once. */
  readonly sections = computed<IconSection[]>(() => {
    const es = this.settings.language() === 'es';
    const needle = normalizeQuery(this.query());
    const sections: IconSection[] = [];
    for (const group of PROJECT_ICON_GROUPS) {
      const icons: IconOption[] = [];
      for (const name of group.icons) {
        const labels = PROJECT_ICON_LABELS[name];
        if (needle && !normalizeQuery(`${name} ${labels.en} ${labels.es}`).includes(needle)) continue;
        icons.push({ name, label: es ? labels.es : labels.en });
      }
      if (icons.length) sections.push({ key: group.key, title: es ? group.es : group.en, icons });
    }
    return sections;
  });

  /** The one icon reachable with Tab: the one being navigated, else the chosen one, else the first shown. */
  readonly tabStop = computed(() => {
    const shown = this.sections().flatMap((section) => section.icons);
    for (const wanted of [this.focused(), this.icon()]) {
      if (wanted && shown.some((option) => option.name === wanted)) return wanted;
    }
    return shown[0]?.name ?? null;
  });

  constructor() {
    // Open with the chosen icon in view, scrolling the grid itself and never the modal around it.
    afterNextRender(() => {
      const grid = this.grid()?.nativeElement;
      const selected = grid?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!grid || !selected) return;
      const box = grid.getBoundingClientRect();
      const rect = selected.getBoundingClientRect();
      if (rect.top < box.top || rect.bottom > box.bottom) {
        grid.scrollTop += rect.top - box.top - (box.height - rect.height) / 2;
      }
    });
  }

  private initial<T>(pick: (p: Project) => T): T | undefined {
    const project = this.project();
    return project ? pick(project) : undefined;
  }

  /** Arrow keys move focus between the icons; Up and Down go to the nearest icon in the row above or below. */
  moveFocus(event: KeyboardEvent): void {
    const key = event.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
    const grid = this.grid()?.nativeElement;
    const current = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('button') : null;
    if (!grid || !current) return;
    const buttons = Array.from(grid.querySelectorAll<HTMLElement>('button'));
    const index = buttons.indexOf(current);
    let next: HTMLElement | undefined;
    if (key === 'ArrowLeft') next = buttons[index - 1];
    else if (key === 'ArrowRight') next = buttons[index + 1];
    else if (key === 'Home') next = buttons[0];
    else if (key === 'End') next = buttons[buttons.length - 1];
    else {
      const from = current.getBoundingClientRect();
      const down = key === 'ArrowDown';
      let best = Infinity;
      for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        const rows = down ? rect.top - from.top : from.top - rect.top;
        if (rows < from.height / 2) continue;
        // The nearest row first, then the nearest column within it.
        const distance = rows * 1000 + Math.abs(rect.left - from.left);
        if (distance < best) {
          best = distance;
          next = button;
        }
      }
    }
    event.preventDefault();
    if (!next) return;
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  submit(): void {
    const trimmed = this.name().trim();
    if (!trimmed) return;
    this.save.emit({
      icon: this.icon(),
      name: trimmed,
      description: this.description().trim(),
      notes: this.notes().trim(),
    });
  }
}
