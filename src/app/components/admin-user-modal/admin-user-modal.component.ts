import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ApiError } from '../../../core/api';
import { AdminService, type AdminUser } from '../../../services/admin.service';

type Notice = 'emailSaved' | 'passwordSaved' | 'revoked';
type FormError = 'email' | 'taken' | 'tooShort' | 'tooLong' | 'self' | 'gone' | 'network';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
/** The backend refuses passwords over 72 UTF-8 bytes (BCrypt's limit). */
const MAX_PASSWORD_BYTES = 72;

/** Edits one account: email, a new password, sign-out everywhere, and deletion behind a second click. */
@Component({
  selector: 'app-admin-user-modal',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-user-modal.component.html',
  styleUrl: './admin-user-modal.component.css',
})
export class AdminUserModalComponent {
  private readonly admin = inject(AdminService);

  readonly user = input.required<AdminUser>();
  /** The admin's own account is shown read-only: the server refuses to change it. */
  readonly isSelf = input(false);
  readonly close = output<void>();

  readonly email = signal<string | null>(null);
  readonly password = signal('');
  readonly confirmingDelete = signal(false);
  readonly busy = signal(false);
  readonly notice = signal<Notice | null>(null);
  readonly error = signal<FormError | null>(null);

  /** Until the field is edited it shows the account's current email. */
  readonly emailValue = computed(() => this.email() ?? this.user().email);
  readonly canSaveEmail = computed(
    () => !this.busy() && this.emailValue().trim().toLowerCase() !== this.user().email && this.emailValue().trim() !== '',
  );
  readonly canSavePassword = computed(() => !this.busy() && this.password() !== '');

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }

  saveEmail(): void {
    const email = this.emailValue().trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) return this.error.set('email');
    void this.run('emailSaved', () => this.admin.update(this.user().id, { email }), () => this.email.set(null));
  }

  savePassword(): void {
    const password = this.password();
    if (password.length < MIN_PASSWORD_LENGTH) return this.error.set('tooShort');
    if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return this.error.set('tooLong');
    void this.run('passwordSaved', () => this.admin.update(this.user().id, { password }), () => this.password.set(''));
  }

  revoke(): void {
    void this.run('revoked', () => this.admin.revokeSessions(this.user().id));
  }

  remove(): void {
    // The view closes this modal by itself once the user is gone from the list.
    void this.run(null, () => this.admin.remove(this.user().id));
  }

  private async run(notice: Notice | null, action: () => Promise<void>, onSuccess?: () => void): Promise<void> {
    this.busy.set(true);
    this.notice.set(null);
    this.error.set(null);
    try {
      await action();
      onSuccess?.();
      this.notice.set(notice);
    } catch (error) {
      this.error.set(this.toFormError(error));
    } finally {
      this.busy.set(false);
      this.confirmingDelete.set(false);
    }
  }

  private toFormError(error: unknown): FormError {
    if (!(error instanceof ApiError)) return 'network';
    switch (error.status) {
      case 400:
        return 'email';
      case 404:
        return 'gone';
      case 409:
        return this.isSelf() ? 'self' : 'taken';
      default:
        return 'network';
    }
  }
}
