import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { EQUIPMENT } from '../../../lib/sportask/equipment';
import { localize } from '../../../lib/sportask/texts';
import { SettingsService } from '../../../services/settings.service';
import type { EquipmentInventory, EquipmentItem } from '../../../types/sportask';
import { UiIconComponent, type UiIconName } from '../ui-icon/ui-icon.component';

type BandStrength = 'light' | 'medium' | 'heavy';

const BAND_STRENGTHS: readonly BandStrength[] = ['light', 'medium', 'heavy'];
const MAX_WEIGHTS = 12;

/**
 * The equipment block of Configuration > Sportask and of the setup wizard: what the user owns, with the weights of
 * kettlebells and dumbbells and the strengths of the bands. Presentational: the whole inventory in, the changed inventory out.
 */
@Component({
  selector: 'app-sportask-equipment-fields',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-equipment-fields.component.html',
  styleUrl: './sportask-equipment-fields.component.css',
})
export class SportaskEquipmentFieldsComponent {
  readonly value = input.required<EquipmentInventory>();
  readonly changed = output<EquipmentInventory>();

  private readonly lang = inject(SettingsService).language;
  protected readonly bandStrengths = BAND_STRENGTHS;
  protected readonly maxWeights = MAX_WEIGHTS;

  /** The weight being typed, per equipment id. */
  protected readonly weightDrafts = signal<Readonly<Record<string, string | undefined>>>({});

  protected readonly rows = computed(() => {
    const lang = this.lang();
    const inventory = this.value();
    return EQUIPMENT.all.map((e) => {
      const item: EquipmentItem = inventory[e.id] ?? { owned: false };
      return { id: e.id, icon: e.icon as UiIconName, name: localize(e.name, lang), details: e.details, owned: item.owned, weights: item.weightsKg ?? [], bands: item.bandStrengths ?? [] };
    });
  });

  private setItem(id: string, change: Partial<EquipmentItem>): void {
    const inventory = this.value();
    const item: EquipmentItem = inventory[id] ?? { owned: false };
    this.changed.emit({ ...inventory, [id]: { ...item, ...change } });
  }

  protected toggleOwned(id: string): void {
    this.setItem(id, { owned: !(this.value()[id]?.owned ?? false) });
  }

  protected setWeightDraft(id: string, value: string): void {
    this.weightDrafts.update((d) => ({ ...d, [id]: value }));
  }

  protected addWeight(id: string): void {
    const kg = Math.round(Number((this.weightDrafts()[id] ?? '').replace(',', '.')) * 100) / 100;
    if (!(kg > 0 && kg <= 500)) return;
    const current = this.value()[id]?.weightsKg ?? [];
    if (current.length < MAX_WEIGHTS && !current.includes(kg)) {
      this.setItem(id, { weightsKg: [...current, kg].sort((a, b) => a - b) });
    }
    this.setWeightDraft(id, '');
  }

  protected removeWeight(id: string, kg: number): void {
    this.setItem(id, { weightsKg: (this.value()[id]?.weightsKg ?? []).filter((w) => w !== kg) });
  }

  protected onWeightKeydown(event: KeyboardEvent, id: string): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    this.addWeight(id);
  }

  protected toggleBand(id: string, strength: BandStrength): void {
    const current = this.value()[id]?.bandStrengths ?? [];
    const next = current.includes(strength) ? current.filter((b) => b !== strength) : BAND_STRENGTHS.filter((b) => b === strength || current.includes(b));
    this.setItem(id, { bandStrengths: next });
  }
}
