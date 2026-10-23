import { ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FitnessAssessmentsComponent } from '../fitness-assessments/fitness-assessments.component';
import { FitnessChecksComponent } from '../fitness-checks/fitness-checks.component';
import { FitnessEquipmentComponent } from '../fitness-equipment/fitness-equipment.component';
import { FitnessExercisesComponent } from '../fitness-exercises/fitness-exercises.component';
import { FitnessLaddersComponent } from '../fitness-ladders/fitness-ladders.component';
import { FitnessPreviewComponent } from '../fitness-preview/fitness-preview.component';
import { FitnessProgramsComponent } from '../fitness-programs/fitness-programs.component';
import { FitnessTemplatesComponent } from '../fitness-templates/fitness-templates.component';
import { FitnessTimingsComponent } from '../fitness-timings/fitness-timings.component';
import { FitnessVersionsComponent } from '../fitness-versions/fitness-versions.component';
import { FITNESS_TABS, type FitnessTab, FitnessEditorState } from './fitness-editor.state';

/**
 * The Fitness director's view (docs/sportask/DIRECTOR.md section 2.6): a status bar (saved, unsaved, published), Save draft, Publish
 * and Discard, then one tab per kind of content. The draft is a catalog overlay held by `FitnessEditorState`; nothing reaches users
 * until it is published. Shown only while the signed-in account is a director.
 */
@Component({
  selector: 'app-fitness-view',
  standalone: true,
  imports: [
    TranslatePipe,
    FitnessExercisesComponent,
    FitnessLaddersComponent,
    FitnessProgramsComponent,
    FitnessTemplatesComponent,
    FitnessTimingsComponent,
    FitnessAssessmentsComponent,
    FitnessEquipmentComponent,
    FitnessPreviewComponent,
    FitnessChecksComponent,
    FitnessVersionsComponent,
  ],
  providers: [FitnessEditorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Not encapsulated, so the editors inside it share the .fd-* styles of the stylesheet instead of each shipping a copy.
  encapsulation: ViewEncapsulation.None,
  templateUrl: './fitness-view.component.html',
  styleUrl: './fitness-view.component.css',
})
export class FitnessViewComponent {
  protected readonly state = inject(FitnessEditorState);
  private readonly injector = inject(Injector);
  protected readonly tabs = FITNESS_TABS;

  protected readonly confirm = signal<'discard' | 'publish' | null>(null);
  protected readonly note = signal('');
  private readonly noteField = viewChild<ElementRef<HTMLInputElement>>('noteField');
  private readonly keepButton = viewChild<ElementRef<HTMLButtonElement>>('keepButton');

  /** One line saying where the draft stands. */
  protected readonly status = computed(() => {
    const s = this.state;
    if (s.busy() === 'loading') return { kind: 'busy', text: s.t('status.loading') };
    if (s.busy() === 'saving') return { kind: 'busy', text: s.t('status.saving') };
    if (s.busy() === 'publishing') return { kind: 'busy', text: s.t('status.publishing') };
    if (s.busy() === 'checking') return { kind: 'busy', text: s.t('status.checking') };
    const head = s.published();
    const versionText = head ? s.t('status.published', { n: head.version }) : s.t('status.neverPublished');
    if (s.dirty()) return { kind: 'dirty', text: `${s.t('status.unsaved')} · ${versionText}` };
    if (s.unpublished()) return { kind: 'ahead', text: `${s.t('status.savedAhead')} · ${versionText}` };
    return { kind: 'clean', text: `${s.t('status.saved')} · ${versionText}` };
  });

  /** Counts on the Checks tab. */
  protected readonly badge = computed(() => {
    const e = this.state.errors().length;
    return e > 0 ? { n: e, kind: 'error' } : this.state.warnings().length > 0 ? { n: this.state.warnings().length, kind: 'warning' } : null;
  });

  protected readonly canPublish = computed(() => !this.state.busy() && this.state.errors().length === 0 && (this.state.dirty() || this.state.unpublished()) && this.note().trim().length >= 3);

  protected select(tab: FitnessTab): void {
    this.state.selectTab(tab);
  }

  protected onTabKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = this.tabs[(this.tabs.indexOf(this.state.tab()) + step + this.tabs.length) % this.tabs.length]!;
    this.select(next);
    const tablist = event.currentTarget as HTMLElement;
    queueMicrotask(() => tablist.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus());
  }

  protected save(): void {
    void this.state.save();
  }

  protected openPublish(): void {
    this.confirm.set('publish');
    const rollback = this.state.rollbackOf();
    if (!this.note().trim() && rollback !== null) this.note.set(this.state.t('publish.rollbackNote', { n: rollback }));
    afterNextRender(() => this.noteField()?.nativeElement.focus(), { injector: this.injector });
  }

  protected openDiscard(): void {
    this.confirm.set('discard');
    afterNextRender(() => this.keepButton()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async doPublish(): Promise<void> {
    if (!this.canPublish()) return;
    if (await this.state.publish(this.note().trim())) {
      this.note.set('');
      this.confirm.set(null);
    }
  }

  protected async doDiscard(): Promise<void> {
    this.confirm.set(null);
    await this.state.load();
  }

  /** Escape closes an open question first (and is swallowed, so it does not also leave the view). */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.confirm() !== null) {
      event.stopPropagation();
      this.confirm.set(null);
    }
  }
}
