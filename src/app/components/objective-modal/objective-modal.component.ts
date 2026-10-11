import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { isIsoDate } from '../../../lib/dates';
import { trapTab } from '../../../lib/focus-trap';
import { HORIZONS } from '../../../lib/flow-rules';
import { FlowService } from '../../../services/flow.service';
import type { Horizon, Objective, ObjectiveStatus } from '../../../types/flow';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

const STATUSES: readonly ObjectiveStatus[] = ['active', 'achieved', 'dropped'];

/** Everything the modal edits, held locally until Save. `targetDate` is '' or 'YYYY-MM-DD'. */
interface ObjectiveDraft {
  title: string;
  description: string;
  horizon: Horizon;
  status: ObjectiveStatus;
  targetDate: string;
}

function draftFrom(objective: Objective | null, horizon: Horizon): ObjectiveDraft {
  return {
    title: objective?.title ?? '',
    description: objective?.description ?? '',
    horizon: objective?.horizon ?? horizon,
    status: objective?.status ?? 'active',
    targetDate: objective?.targetDate ?? '',
  };
}

function draftsEqual(a: ObjectiveDraft, b: ObjectiveDraft): boolean {
  return (
    a.title.trim() === b.title.trim() &&
    a.description.trim() === b.description.trim() &&
    a.horizon === b.horizon &&
    a.status === b.status &&
    a.targetDate === b.targetDate
  );
}

type Confirm = 'discard' | 'delete' | null;

let nextUid = 0;

/**
 * Creates or edits an objective of a project (title, description, horizon, status, target date), in the Task
 * Details pattern: the form edits a local draft and nothing is written until *Save changes* (disabled until
 * something changed and the title is filled; Ctrl/Cmd+Enter also saves). Closing a dirty draft asks "Discard
 * your changes?" in a confirm bar, and Delete asks inline too ("Delete this objective? Its links are removed.");
 * the store removes the links, the tasks and milestones that fed it are untouched. Escape is swallowed so the
 * project view does not also leave. Created per use, like the other editors.
 */
@Component({
  selector: 'app-objective-modal',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-modal.component.html',
  styleUrl: './objective-modal.component.css',
})
export class ObjectiveModalComponent {
  private readonly flow = inject(FlowService);
  private readonly injector = inject(Injector);

  readonly projectId = input.required<string>();
  /** The objective to edit; null creates one. */
  readonly objective = input<Objective | null>(null);
  /** Horizon a new objective starts in. */
  readonly horizon = input<Horizon>('short');

  readonly close = output<void>();
  readonly created = output<Objective>();

  readonly uid = `objective-modal-${nextUid++}`;
  readonly horizons = HORIZONS;
  readonly statuses = STATUSES;

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly confirmFocus = viewChild<ElementRef<HTMLElement>>('confirmFocus');
  private readonly deleteButton = viewChild<ElementRef<HTMLElement>>('deleteButton');

  /** The objective as it was when the modal opened: dirty is measured against it. */
  readonly baseline = linkedSignal<string, ObjectiveDraft>({
    source: () => this.objective()?.id ?? '',
    computation: () => draftFrom(untracked(this.objective), untracked(this.horizon)),
  });
  readonly draft = linkedSignal<string, ObjectiveDraft>({
    source: () => this.objective()?.id ?? '',
    computation: () => draftFrom(untracked(this.objective), untracked(this.horizon)),
  });

  readonly confirm = signal<Confirm>(null);

  readonly editing = computed(() => this.objective() !== null);
  readonly dirty = computed(() => !draftsEqual(this.draft(), this.baseline()));
  readonly titleValid = computed(() => this.draft().title.trim().length > 0);
  readonly canSave = computed(() => this.dirty() && this.titleValid());

  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private pressedOnBackdrop = false;
  private focusBeforeConfirm: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => this.panel().nativeElement.querySelector<HTMLElement>('input')?.focus({ preventScroll: true }));
    inject(DestroyRef).onDestroy(() => {
      if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    });
  }

  edit(patch: Partial<ObjectiveDraft>): void {
    this.draft.update((d) => ({ ...d, ...patch }));
  }

  editDate(value: string): void {
    this.edit({ targetDate: isIsoDate(value) ? value : '' });
  }

  // ---- closing ----

  /** The one way out: a clean draft closes, a dirty one asks first, an open question is dismissed. */
  requestClose(): void {
    if (this.confirm()) this.dismissConfirm();
    else if (this.dirty()) this.openConfirm('discard');
    else this.close.emit();
  }

  discard(): void {
    this.close.emit();
  }

  askDelete(): void {
    this.openConfirm('delete');
  }

  dismissConfirm(): void {
    const kind = this.confirm();
    this.confirm.set(null);
    afterNextRender(
      () => {
        const target =
          kind === 'delete'
            ? this.deleteButton()?.nativeElement
            : this.focusBeforeConfirm?.isConnected
              ? this.focusBeforeConfirm
              : this.panel().nativeElement;
        target?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  private openConfirm(kind: Exclude<Confirm, null>): void {
    this.focusBeforeConfirm = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.confirm.set(kind);
    afterNextRender(() => this.confirmFocus()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  onBackdropDown(event: MouseEvent): void {
    this.pressedOnBackdrop = event.target === event.currentTarget;
  }

  /** Only a press *and* release on the backdrop counts, so dragging a text selection out of a field does not. */
  onBackdropClick(event: MouseEvent): void {
    if (this.pressedOnBackdrop && event.target === event.currentTarget) this.requestClose();
    this.pressedOnBackdrop = false;
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Swallowed: the project view would otherwise treat it as "leave the project".
      event.preventDefault();
      event.stopPropagation();
      this.requestClose();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      if (!this.confirm()) this.save();
    } else {
      trapTab(event, this.panel().nativeElement);
    }
  }

  // ---- saving and deleting ----

  save(): void {
    if (!this.canSave()) return;
    const draft = this.draft();
    const description = draft.description.trim();
    const targetDate = isIsoDate(draft.targetDate) ? draft.targetDate : undefined;
    const current = this.objective();
    if (current) {
      this.flow.updateObjective(current.id, {
        title: draft.title,
        description: description || undefined,
        horizon: draft.horizon,
        status: draft.status,
        targetDate,
      });
    } else {
      const added = this.flow.addObjective({
        projectId: this.projectId(),
        title: draft.title,
        description: description || undefined,
        horizon: draft.horizon,
        status: draft.status,
        targetDate,
      });
      if (added) this.created.emit(added);
    }
    this.close.emit();
  }

  remove(): void {
    const current = this.objective();
    if (!current) return;
    this.flow.removeObjective(current.id);
    this.close.emit();
  }
}
