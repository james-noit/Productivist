import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { diffOverlays, type Change } from '../../../lib/sportask/overlay/edit';
import { sanitizeOverlay } from '../../../lib/sportask/overlay/sanitize-overlay';
import { emptyOverlay } from '../../../lib/sportask/overlay/types';
import { type VersionSummary, FitnessService } from '../../../services/fitness.service';
import { FitnessEditorState } from '../fitness-view/fitness-editor.state';

/** Versions: who published what and when (with the note), what each version changed, and loading one into the draft or rolling back to it. */
@Component({
  selector: 'app-fitness-versions',
  standalone: true,
  imports: [TranslatePipe],
  host: { class: 'fd-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fitness-versions.component.html',
  styleUrl: './fitness-versions.component.css',
})
export class FitnessVersionsComponent {
  protected readonly state = inject(FitnessEditorState);
  private readonly api = inject(FitnessService);

  protected readonly versions = signal<VersionSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly selected = signal<number | null>(null);
  protected readonly changes = signal<Change[] | null>(null);
  protected readonly confirm = signal<{ version: number; rollback: boolean } | null>(null);
  private requestId = 0;

  protected readonly current = computed(() => this.versions().find((v) => v.version === this.selected()) ?? null);
  protected readonly head = computed(() => this.state.published()?.version ?? 0);
  protected readonly blocked = computed(() => this.state.dirty() || !!this.state.busy());

  constructor() {
    // Reload the list whenever the published version changes (including the first load of the view).
    effect(() => {
      this.state.published();
      untracked(() => void this.load());
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      this.versions.set(await this.api.versions());
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Selects a version and works out what it changed relative to the one before it. */
  protected async select(version: number): Promise<void> {
    this.selected.set(version);
    this.confirm.set(null);
    this.changes.set(null);
    const id = ++this.requestId;
    try {
      const [doc, previous] = await Promise.all([this.api.version(version), version > 1 ? this.api.version(version - 1) : Promise.resolve(null)]);
      if (id !== this.requestId) return;
      this.changes.set(diffOverlays(previous ? sanitizeOverlay(previous.document) : emptyOverlay(), sanitizeOverlay(doc.document)));
    } catch {
      if (id === this.requestId) this.changes.set([]);
    }
  }

  protected ask(version: number, rollback: boolean): void {
    this.confirm.set({ version, rollback });
  }

  protected async doRestore(): Promise<void> {
    const c = this.confirm();
    if (!c) return;
    this.confirm.set(null);
    await this.state.restore(c.version, c.rollback);
    this.state.selectTab('exercises');
  }

  protected name(change: Change): string {
    return change.id;
  }
}
