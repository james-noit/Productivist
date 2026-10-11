import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ViewService } from '../../../services/view.service';
import { ProjectsPageState } from '../projects-view/projects-page.state';
import { UiIconComponent, type UiIconName } from '../ui-icon/ui-icon.component';

type FabAction = 'task' | 'project' | 'recurring';

interface FabItem {
  action: FabAction;
  icon: UiIconName;
  labelKey: string;
  /** The single-key shortcut, if any. */
  shortcut?: string;
}

const ITEMS: readonly FabItem[] = [
  { action: 'task', icon: 'check', labelKey: 'projects.fab.task', shortcut: 'N' },
  { action: 'project', icon: 'folder', labelKey: 'projects.fab.project', shortcut: 'P' },
  { action: 'recurring', icon: 'repeat', labelKey: 'projects.fab.recurring' },
];

/**
 * The floating "+" of the Tasks and projects page (both tabs): a round button at the bottom right whose menu opens
 * upwards with New task, New project and New recurring task. The creation dialogs belong to the page; this asks
 * for them through `ProjectsPageState` (and `ViewService.openRecurring('new')` for a series). It also owns the
 * `N` and `P` shortcuts. It sits above the header's floating support pill on phones through
 * `--floating-bottom-offset` (see `style.css`), and below modal overlays.
 */
@Component({
  selector: 'app-fab-menu',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fab-menu.component.html',
  styleUrl: './fab-menu.component.css',
})
export class FabMenuComponent {
  private readonly state = inject(ProjectsPageState);
  private readonly view = inject(ViewService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');

  readonly items = ITEMS;
  readonly open = signal(false);

  toggleMenu(): void {
    if (this.open()) this.close();
    else this.show(0);
  }

  private show(index: number): void {
    this.open.set(true);
    afterNextRender(() => this.menuItems().at(index)?.focus(), { injector: this.injector });
  }

  close(returnFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.toggle().nativeElement.focus();
  }

  choose(action: FabAction): void {
    const toggle = this.toggle().nativeElement;
    this.open.set(false);
    // Focus goes back here when the dialog closes, since the menu item that was clicked is gone by then.
    toggle.focus();
    this.run(action, toggle);
  }

  private run(action: FabAction, opener: HTMLElement | null): void {
    if (action === 'task') this.state.openNewTask(opener);
    else if (action === 'project') this.state.openNewProject(opener);
    else this.view.openRecurring('new');
  }

  private menuItems(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }

  onToggleKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.show(event.key === 'ArrowUp' ? ITEMS.length - 1 : 0);
    }
  }

  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    const items = this.menuItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (index + 1) % items.length;
        break;
      case 'ArrowUp':
        next = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  /** Tabbing out of the menu closes it, like a click elsewhere. */
  @HostListener('focusout', ['$event'])
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (this.open() && next && !this.host.nativeElement.contains(next)) this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  /** N = new task, P = new project: not while typing, with a modifier, or while any dialog is open. */
  @HostListener('document:keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'n' && key !== 'p') return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))) return;
    if (this.view.planningOpen() || this.view.configOpen() || this.view.recurringOpen() || this.state.filtersOpen()) return;
    if (document.querySelector('[aria-modal="true"]')) return;
    event.preventDefault();
    this.open.set(false);
    this.run(key === 'n' ? 'task' : 'project', null);
  }
}
