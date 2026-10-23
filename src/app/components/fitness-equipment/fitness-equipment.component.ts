import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CATALOG } from '../../../lib/sportask/catalog';
import { newItemId, patchEntry } from '../../../lib/sportask/overlay/edit';
import { EQUIPMENT_DETAILS, EQUIPMENT_ICONS, type EquipmentEntry } from '../../../lib/sportask/overlay/types';
import type { EquipmentDef, LocalizedText } from '../../../types/sportask';
import { FitnessEditorState } from '../fitness-view/fitness-editor.state';
import { FitnessTextPairComponent } from '../fitness-text-pair/fitness-text-pair.component';
import { UiIconComponent, type UiIconName } from '../ui-icon/ui-icon.component';

const KEYS = ['name', 'icon', 'details'] as const;
const shape = (e: EquipmentDef): EquipmentEntry => ({ id: e.id, name: e.name, icon: e.icon, ...(e.details ? { details: e.details } : {}) });

/** Equipment: the things a user can own. Exercises name the ones they need; the settings form of the app is built from this list. */
@Component({
  selector: 'app-fitness-equipment',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent, FitnessTextPairComponent],
  host: { class: 'fd-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fitness-equipment.component.html',
  styleUrl: './fitness-equipment.component.css',
})
export class FitnessEquipmentComponent {
  protected readonly state = inject(FitnessEditorState);
  private readonly injector = inject(Injector);
  protected readonly icons = EQUIPMENT_ICONS;
  protected readonly detailKinds = EQUIPMENT_DETAILS;
  protected readonly creating = signal<{ en: string; es: string } | null>(null);
  protected readonly confirmDelete = signal(false);
  private readonly newName = viewChild<ElementRef<HTMLInputElement>>('newName');
  private readonly baseById = new Map(CATALOG.equipment.base.map((e) => [e.id, e]));

  protected readonly rows = computed(() => {
    const changed = new Set((this.state.overlay().equipment ?? []).map((e) => e.id));
    return this.state.content().catalog.equipment.all.map((e) => ({ e, builtin: this.baseById.has(e.id), changed: changed.has(e.id) }));
  });
  protected readonly id = computed(() => this.state.selected('equipment'));
  protected readonly item = computed(() => (this.id() ? this.state.content().catalog.equipment.get(this.id()!) : undefined));
  protected readonly base = computed(() => (this.id() ? this.baseById.get(this.id()!) : undefined));
  protected readonly changed = computed(() => !!this.base() && !!this.id() && !!this.state.entry('equipment', this.id()!));
  protected readonly published = computed(() => !!this.id() && !!this.state.published()?.overlay.equipment?.some((e) => e.id === this.id()));
  protected readonly problems = computed(() => this.state.issues().filter((i) => i.section === 'equipment' && i.id === this.id()));
  protected readonly usedBy = computed(() => {
    const id = this.id();
    return id ? this.state.content().catalog.exercises.all.filter((e) => e.needsOneOf.includes(id)).length : 0;
  });

  protected icon(name: string): UiIconName {
    return name as UiIconName;
  }

  protected select(id: string): void {
    this.state.select('equipment', id);
    this.confirmDelete.set(false);
  }

  protected startCreate(): void {
    this.creating.set({ en: '', es: '' });
    afterNextRender(() => this.newName()?.nativeElement.focus(), { injector: this.injector });
  }

  protected createValid(): boolean {
    const c = this.creating();
    return !!c && c.en.trim().length > 0 && c.es.trim().length > 0;
  }

  protected create(): void {
    const c = this.creating();
    if (!c || !this.createValid()) return;
    const id = newItemId(c.en, new Set(this.state.content().catalog.equipment.all.map((e) => e.id)), 'gear');
    const full: EquipmentDef = { id, name: { en: c.en.trim(), es: c.es.trim() }, icon: 'dumbbell' };
    const entry = patchEntry<EquipmentEntry>(undefined, shape(full), KEYS);
    if (entry) this.state.setEntry('equipment', entry);
    this.creating.set(null);
    this.select(id);
  }

  private write(full: EquipmentDef): void {
    const base = this.base();
    const entry = patchEntry<EquipmentEntry>(base ? shape(base) : undefined, shape(full), KEYS);
    if (entry) this.state.setEntry('equipment', entry);
    else this.state.clearEntry('equipment', full.id);
  }

  protected setName(name: LocalizedText | undefined): void {
    const e = this.item();
    if (e && name) this.write({ ...e, name });
  }

  protected setIcon(event: Event): void {
    const e = this.item();
    if (e) this.write({ ...e, icon: (event.target as HTMLSelectElement).value });
  }

  protected setDetails(event: Event): void {
    const e = this.item();
    const value = (event.target as HTMLSelectElement).value;
    if (!e) return;
    const { details: _old, ...rest } = e;
    this.write(value === 'weights' || value === 'bandStrengths' ? { ...rest, details: value } : rest);
  }

  protected reset(): void {
    const id = this.id();
    if (id) this.state.clearEntry('equipment', id);
  }

  protected remove(): void {
    const id = this.id();
    if (!id) return;
    this.state.clearEntry('equipment', id);
    this.state.select('equipment', null);
    this.confirmDelete.set(false);
  }

  protected setCreating(field: 'en' | 'es', event: Event): void {
    this.creating.update((c) => (c ? { ...c, [field]: (event.target as HTMLInputElement).value } : c));
  }
}
