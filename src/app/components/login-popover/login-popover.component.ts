import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ApiError } from '../../../core/api';
import { AccountService } from '../../../services/account.service';
import { SyncService } from '../../../services/sync.service';
import { ViewService } from '../../../services/view.service';

type Mode = 'login' | 'signup';
type FormError = 'email' | 'tooShort' | 'tooLong' | 'mismatch' | 'credentials' | 'taken' | 'network';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
/** The backend refuses passwords over 72 UTF-8 bytes (BCrypt's limit). */
const MAX_PASSWORD_BYTES = 72;

/**
 * Header entry point for accounts. Signed out: a "Login" button that drops a compact form underneath, with the
 * sign-up fields hidden until "Sign up" is clicked. Signed in: a chip that opens the Settings panel, where the
 * account itself is managed.
 */
@Component({
  selector: 'app-login-popover',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-popover.component.html',
  styleUrl: './login-popover.component.css',
})
export class LoginPopoverComponent {
  readonly accounts = inject(AccountService);
  readonly sync = inject(SyncService);
  readonly view = inject(ViewService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');

  readonly open = signal(false);
  readonly mode = signal<Mode>('login');
  readonly email = signal('');
  readonly password = signal('');
  readonly repeat = signal('');
  readonly busy = signal(false);
  readonly error = signal<FormError | null>(null);

  readonly canSubmit = computed(() => this.email().trim() !== '' && this.password() !== '' && !this.busy());

  toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    afterNextRender(() => this.emailInput()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Closing resets the form to a plain login, so reopening never starts mid-signup or with a typed password. */
  close(): void {
    this.open.set(false);
    this.error.set(null);
    this.mode.set('login');
    this.password.set('');
    this.repeat.set('');
  }

  setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.repeat.set('');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // composedPath() is fixed at dispatch time, unlike `target.isConnected`, which is false once a clicked
    // element (the mode-switch link) has been swapped out by the very click being handled.
    if (this.open() && !event.composedPath().includes(this.host.nativeElement)) this.close();
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (this.open()) this.close();
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    const email = this.email().trim();
    const password = this.password();
    const signingUp = this.mode() === 'signup';

    const invalid = this.validate(email, password, signingUp);
    if (invalid) {
      this.error.set(invalid);
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      await (signingUp ? this.accounts.signup(email, password) : this.accounts.login(email, password));
      this.close();
    } catch (error) {
      this.error.set(this.describe(error, signingUp));
    } finally {
      this.busy.set(false);
    }
  }

  private validate(email: string, password: string, signingUp: boolean): FormError | null {
    if (!EMAIL_PATTERN.test(email)) return 'email';
    if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return 'tooLong';
    if (!signingUp) return null;
    if (password.length < MIN_PASSWORD_LENGTH) return 'tooShort';
    if (password !== this.repeat()) return 'mismatch';
    return null;
  }

  private describe(error: unknown, signingUp: boolean): FormError {
    if (!(error instanceof ApiError)) return 'network';
    if (error.status === 409) return 'taken';
    if (error.status === 401) return 'credentials';
    return signingUp ? 'email' : 'credentials';
  }
}
