import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatIso } from '../../../lib/dates';
import { CATALOG } from '../../../lib/sportask/catalog';
import { GOALS } from '../../../lib/sportask/goals';
import { setExerciseIds } from '../../../lib/sportask/metrics/helpers';
import { type PersonalRecord, personalRecords } from '../../../lib/sportask/metrics/summary';
import { BUILTIN_TEMPLATES } from '../../../lib/sportask/templates';
import { localize } from '../../../lib/sportask/texts';
import { removeBlock } from '../../../lib/sportask/data-ops';
import { SportDataService } from '../../../services/sport-data.service';
import type { BlockStatus, SportBlock } from '../../../types/sportask';
import { KebabMenuComponent } from '../kebab-menu/kebab-menu.component';
import { SportaskMarksModalComponent } from '../sportask-marks-modal/sportask-marks-modal.component';
import { SportPanelState } from '../sportask-view/sport-panel.state';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

const DAYS_PER_PAGE = 14;
const RECORDS_SHOWN = 6;
/** Most exercise names a row spells out. */
const SUMMARY_PARTS = 3;

interface Row {
  id: string;
  time: string;
  kind: 'train' | 'warmup' | 'test';
  source: string;
  summary: string;
  status: BlockStatus;
  rpe: number | null;
}

interface Day {
  date: string;
  label: string;
  rows: Row[];
}

interface RecordRow {
  key: string;
  name: string;
  value: string;
  date: string;
  load: string;
}

/**
 * The History tab: blocks by day, newest first, with the personal records on top. Each block has a ⋯ menu: *Edit marks* (the Results
 * form in a dialog, then `updateBlock`) and *Delete* (an inline confirmation under the row).
 */
@Component({
  selector: 'app-sportask-history',
  standalone: true,
  imports: [TranslatePipe, KebabMenuComponent, SportaskMarksModalComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-history.component.html',
  styleUrl: './sportask-history.component.css',
})
export class SportaskHistoryComponent {
  protected readonly state = inject(SportPanelState);
  private readonly data = inject(SportDataService);
  private readonly injector = inject(Injector);
  private readonly deleteButton = viewChild<ElementRef<HTMLButtonElement>>('deleteButton');
  private readonly dayList = viewChild<ElementRef<HTMLElement>>('dayList');

  protected readonly shownDays = signal(DAYS_PER_PAGE);
  protected readonly allRecords = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  protected readonly hasBlocks = computed(() => this.state.blocks().length > 0);

  private readonly dayFormat = computed(() => new Intl.DateTimeFormat(this.state.lang(), { weekday: 'long', day: 'numeric', month: 'long' }));
  private readonly timeFormat = computed(() => new Intl.DateTimeFormat(this.state.lang(), { hour: '2-digit', minute: '2-digit' }));
  private readonly numbers = computed(() => new Intl.NumberFormat(this.state.lang(), { maximumFractionDigits: 1 }));

  private sourceOf(b: SportBlock): string {
    const lang = this.state.lang();
    if (b.kind === 'test' && b.assessmentId) return localize(CATALOG.assessments.get(b.assessmentId)?.name, lang);
    if (b.origin === 'goal') return localize(b.goalId ? GOALS.get(b.goalId)?.name : undefined, lang) || this.state.t('panel.h.goal');
    const builtin = b.templateId ? BUILTIN_TEMPLATES.get(b.templateId) : undefined;
    const mine = b.templateId ? this.data.templates().find((t) => t.id === b.templateId) : undefined;
    return (builtin ? localize(builtin.nameText, lang) : mine?.name) || this.state.t('panel.h.free');
  }

  /** "3 × Push-up · 2 × Squat" for a workout; the values for a test; nothing for a skipped block. */
  private summaryOf(b: SportBlock): string {
    if (b.status === 'skipped') return '';
    const n = this.numbers();
    if (b.kind === 'test') {
      const unit = (b.assessmentId ? CATALOG.assessments.get(b.assessmentId)?.metric : undefined) ?? 'reps';
      const parts = b.steps.flatMap((s, i) => {
        const r = b.results.find((x) => x.stepIndex === i);
        return r?.done && r.value !== undefined ? [`${s.side ? this.state.t(`panel.g.${s.side}`) + ' ' : ''}${n.format(r.value)} ${this.state.t(`panel.unit.${unit}`)}`] : [];
      });
      return parts.join(' · ');
    }
    const counts = new Map<string, number>();
    for (const id of setExerciseIds(b)) counts.set(id, (counts.get(id) ?? 0) + 1);
    const parts = [...counts].map(([id, count]) => `${count} × ${this.state.exerciseName(id)}`);
    return parts.length > SUMMARY_PARTS ? `${parts.slice(0, SUMMARY_PARTS).join(' · ')} · +${parts.length - SUMMARY_PARTS}` : parts.join(' · ');
  }

  /** Every day with its blocks, newest first. */
  private readonly allDays = computed<Day[]>(() => {
    this.state.lang();
    const days: Day[] = [];
    const time = this.timeFormat();
    for (const b of [...this.state.blocks()].reverse()) {
      const row: Row = {
        id: b.id,
        time: time.format(new Date(b.startedAt)),
        kind: b.kind,
        source: this.sourceOf(b),
        summary: this.summaryOf(b),
        status: b.status,
        rpe: b.rpe ?? null,
      };
      const last = days[days.length - 1];
      if (last && last.date === b.date) last.rows.push(row);
      else days.push({ date: b.date, label: formatIso(this.dayFormat(), b.date), rows: [row] });
    }
    return days;
  });
  protected readonly days = computed(() => this.allDays().slice(0, this.shownDays()));
  protected readonly moreDays = computed(() => Math.max(0, this.allDays().length - this.shownDays()));

  private readonly records = computed<RecordRow[]>(() => {
    const n = this.numbers();
    const dateFormat = new Intl.DateTimeFormat(this.state.lang(), { day: 'numeric', month: 'short', year: 'numeric' });
    // The most recent records first (the ones worth a look), then by name.
    return personalRecords(this.state.blocks(), CATALOG)
      .sort((a: PersonalRecord, b: PersonalRecord) => (a.date < b.date ? 1 : a.date > b.date ? -1 : this.state.exerciseName(a.exerciseId).localeCompare(this.state.exerciseName(b.exerciseId), this.state.lang())))
      .map((r) => ({
        key: `${r.exerciseId}|${r.metric}`,
        name: this.state.exerciseName(r.exerciseId),
        value: `${n.format(r.value)} ${this.state.t(`panel.unit.${r.metric}`)}`,
        date: formatIso(dateFormat, r.date),
        load: r.loadKg ? `${n.format(r.loadKg)} kg` : '',
      }));
  });
  protected readonly shownRecords = computed(() => (this.allRecords() ? this.records() : this.records().slice(0, RECORDS_SHOWN)));
  protected readonly moreRecords = computed(() => Math.max(0, this.records().length - RECORDS_SHOWN));

  protected readonly editing = computed(() => {
    const id = this.editingId();
    return id ? (this.state.blocks().find((b) => b.id === id) ?? null) : null;
  });

  protected showMore(): void {
    this.shownDays.update((n) => n + DAYS_PER_PAGE);
  }

  protected edit(id: string): void {
    this.editingId.set(id);
  }

  protected closeEdit(): void {
    this.editingId.set(null);
  }

  protected askDelete(id: string): void {
    this.deletingId.set(id);
    afterNextRender(() => this.deleteButton()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  protected keep(): void {
    this.deletingId.set(null);
  }

  protected remove(id: string): void {
    this.deletingId.set(null);
    removeBlock(this.data, id);
    // The row (and the focus in it) is gone: keep the keyboard user in the list.
    afterNextRender(() => this.dayList()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  protected onRowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.deletingId()) {
      event.stopPropagation();
      this.keep();
    }
  }
}
