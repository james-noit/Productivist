import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { LocalizedText } from '../../../types/sportask';

/**
 * An English and a Spanish text side by side (every visible Sportask text has both; publishing refuses a missing one). Presentational:
 * `[(value)]` is the pair, `multiline` uses textareas.
 */
@Component({
  selector: 'app-fitness-text-pair',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pair">
      @for (lang of langs; track lang) {
        <div class="field">
          <label class="field__label" [for]="uid + lang">{{ label() }} · {{ lang.toUpperCase() }}</label>
          @if (multiline()) {
            <textarea
              class="textarea"
              rows="2"
              [id]="uid + lang"
              [value]="text()[lang]"
              [attr.maxlength]="max()"
              [attr.lang]="lang"
              [attr.aria-invalid]="text()[lang].trim() === '' ? 'true' : null"
              (input)="edit(lang, $event)"
            ></textarea>
          } @else {
            <input
              class="input"
              type="text"
              autocomplete="off"
              [id]="uid + lang"
              [value]="text()[lang]"
              [attr.maxlength]="max()"
              [attr.lang]="lang"
              [attr.aria-invalid]="text()[lang].trim() === '' ? 'true' : null"
              (input)="edit(lang, $event)"
            />
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .pair {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: 0.6rem;
    }

    .textarea {
      min-height: 3.2rem;
    }
  `,
})
export class FitnessTextPairComponent {
  readonly value = model<LocalizedText | undefined>({ en: '', es: '' });
  readonly label = input.required<string>();
  readonly multiline = input(false);
  readonly max = input(400);

  protected readonly langs = ['en', 'es'] as const;
  protected readonly uid = `ftp-${Math.random().toString(36).slice(2, 8)}-`;
  protected readonly text = computed<LocalizedText>(() => this.value() ?? { en: '', es: '' });

  protected edit(lang: 'en' | 'es', event: Event): void {
    this.value.set({ ...this.text(), [lang]: (event.target as HTMLInputElement | HTMLTextAreaElement).value });
  }
}
