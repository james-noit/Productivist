import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { availableFallbacks, requestHostPermission } from '../../../lib/forge-transport';
import type { ForgeError, TransportId } from '../../../types/forge';

/**
 * A forge error as text. For a CORS failure it also offers the ways around it this device has (`availableFallbacks`: the
 * Thunderbird host permission, the mobile apps' native HTTP, or the Productivist server as a relay for signed-in users)
 * and emits the one picked; the caller remembers it on the connection and retries. Thunderbird's permission prompt only
 * appears inside a user gesture, so it is requested here, from the click, before the choice is emitted.
 */
@Component({
  selector: 'app-forge-error',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as e) {
      <div class="ferr" role="alert">
        <p class="ferr__text">{{ 'forge.err.' + e.kind | translate: { host: host() } }}</p>
        @if (e.kind === 'cors') {
          @for (t of options(); track t) {
            <div class="ferr__option">
              <button type="button" class="btn btn--secondary btn--sm" (click)="pick(t)">{{ 'forge.transport.' + t | translate }}</button>
              <span class="ferr__hint">{{ 'forge.transport.' + t + 'Hint' | translate }}</span>
            </div>
          }
          @if (denied()) {
            <p class="ferr__text">{{ 'forge.transport.denied' | translate }}</p>
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .ferr {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .ferr p {
      margin: 0;
      font-size: 0.8rem;
    }

    .ferr__text {
      color: var(--color-high);
    }

    .ferr__option {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .ferr__hint {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
  `,
})
export class ForgeErrorComponent {
  readonly error = input<ForgeError | null>(null);
  /** The forge's web address: the permission to ask for, and what the text names. */
  readonly host = input('');
  readonly use = output<TransportId>();

  readonly denied = signal(false);
  /** The fallbacks of this device. Read when the error shows, so a sign-in made meanwhile is seen. */
  readonly options = computed(() => (this.error()?.kind === 'cors' ? availableFallbacks() : []));

  async pick(transport: TransportId): Promise<void> {
    this.denied.set(false);
    if (transport === 'extension' && !(await requestHostPermission(this.host()))) {
      this.denied.set(true);
      return;
    }
    this.use.emit(transport);
  }
}
