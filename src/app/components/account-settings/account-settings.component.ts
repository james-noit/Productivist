import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ApiError } from '../../../core/api';
import { AccountService } from '../../../services/account.service';
import { SyncService } from '../../../services/sync.service';

type DeleteError = 'wrongPassword' | 'admin' | 'session' | 'network';

/** Account block of the Settings panel: who is signed in, how sync is doing, sign-out and account deletion. */
@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [DatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.css',
})
export class AccountSettingsComponent {
  readonly accounts = inject(AccountService);
  readonly sync = inject(SyncService);
  private readonly injector = inject(Injector);

  readonly confirming = signal(false);
  readonly password = signal('');
  readonly busy = signal(false);
  readonly error = signal<DeleteError | null>(null);
  /** Shown in the signed-out state right after a successful deletion. */
  readonly deleted = signal(false);

  private readonly deleteButton = viewChild<ElementRef<HTMLButtonElement>>('deleteButton');
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');

  constructor() {
    // A later sign-in must not leave a stale "Account deleted" behind.
    effect(() => {
      if (this.accounts.account()) this.deleted.set(false);
    });

    // While the question is open, Escape dismisses it and nothing else. A capture listener on the document runs before
    // the Configuration modal's bubbling `document:keydown.escape` handler wherever focus is, and stopping the event
    // there keeps that handler (and the rest of the page) from seeing it.
    effect((onCleanup) => {
      if (!this.confirming()) return;
      const onKeydown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        event.preventDefault();
        this.cancelDelete();
      };
      document.addEventListener('keydown', onKeydown, true);
      onCleanup(() => document.removeEventListener('keydown', onKeydown, true));
    });

    inject(DestroyRef).onDestroy(() => this.password.set(''));
  }

  askDelete(): void {
    this.error.set(null);
    this.password.set('');
    this.confirming.set(true);
    afterNextRender(() => this.passwordInput()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  cancelDelete(): void {
    if (this.busy()) return;
    this.confirming.set(false);
    this.password.set('');
    this.error.set(null);
    afterNextRender(() => this.deleteButton()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  setPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  async submitDelete(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || !this.password()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.accounts.deleteAccount(this.password());
      // The account is gone, so the template is already showing the signed-out state.
      this.confirming.set(false);
      this.password.set('');
      this.deleted.set(true);
    } catch (error) {
      this.error.set(this.errorKind(error));
      afterNextRender(() => this.passwordInput()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
    } finally {
      this.busy.set(false);
    }
  }

  private errorKind(error: unknown): DeleteError {
    if (error instanceof ApiError) {
      if (error.status === 403) return 'wrongPassword';
      if (error.status === 409) return 'admin';
      if (error.status === 401) return 'session';
    }
    return 'network';
  }
}
