import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SKINS } from '../../../lib/sportask/skins';
import type { StyleValue } from '../../../lib/sportask/setup';
import { localize } from '../../../lib/sportask/texts';
import { SettingsService } from '../../../services/settings.service';

/** The style block of Configuration > Sportask and of the setup wizard: the skin, whether it covers the whole app, step sounds and auto-start. Presentational. */
@Component({
  selector: 'app-sportask-style-fields',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-style-fields.component.html',
  styleUrl: './sportask-style-fields.component.css',
})
export class SportaskStyleFieldsComponent {
  readonly value = input.required<StyleValue>();
  readonly changed = output<StyleValue>();

  private readonly lang = inject(SettingsService).language;

  protected readonly skinTiles = computed(() => {
    const lang = this.lang();
    return SKINS.all.map((s) => ({ id: s.id, name: localize(s.name, lang), scheme: s.colorScheme, preview: s.preview }));
  });

  protected setSkin(skin: string): void {
    this.changed.emit({ ...this.value(), skin });
  }

  protected toggle(key: 'skinWholeApp' | 'cues' | 'autoStartBreak'): void {
    const v = this.value();
    this.changed.emit({ ...v, [key]: !v[key] });
  }
}
