import { ChangeDetectionStrategy, Component, ElementRef, input, model, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * Tags as removable chips followed by a text box: Enter or a comma adds one, Backspace in the empty
 * box removes the last, leaving the box adds what was typed. Duplicates are ignored.
 */
@Component({
  selector: 'app-tag-input',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tag-input.component.html',
  styleUrl: './tag-input.component.css',
})
export class TagInputComponent {
  readonly tags = model.required<string[]>();
  readonly inputId = input<string>('');
  readonly placeholder = input<string>('');

  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  /** Adds the text still in the box (if any) as tags. */
  commitPending(): void {
    const el = this.box().nativeElement;
    this.add(el.value);
    el.value = '';
  }

  onInput(): void {
    const el = this.box().nativeElement;
    if (!el.value.includes(',')) return;
    // Typing or pasting "a, b, c": everything before the last comma is complete.
    const parts = el.value.split(',');
    el.value = parts.pop() ?? '';
    this.add(parts.join(','));
  }

  onKeydown(event: KeyboardEvent): void {
    const el = this.box().nativeElement;
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      // Never let Enter reach a surrounding form or dialog shortcut.
      event.preventDefault();
      event.stopPropagation();
      this.commitPending();
    } else if (event.key === 'Backspace' && !el.value && this.tags().length) {
      this.tags.update((list) => list.slice(0, -1));
    }
  }

  remove(tag: string): void {
    this.tags.update((list) => list.filter((t) => t !== tag));
    this.box().nativeElement.focus();
  }

  focusBox(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.box().nativeElement.focus();
  }

  private add(raw: string): void {
    const incoming = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!incoming.length) return;
    this.tags.update((list) => {
      const next = [...list];
      for (const tag of incoming) if (!next.includes(tag)) next.push(tag);
      return next.length === list.length ? list : next;
    });
  }
}
