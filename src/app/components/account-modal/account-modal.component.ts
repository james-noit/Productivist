import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ApiError } from '../../../core/api';
import { AccountService } from '../../../services/account.service';
import { SyncService } from '../../../services/sync.service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-account-modal',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-modal.component.html',
  styleUrl: './account-modal.component.css',
})
export class AccountModalComponent {
  readonly accounts = inject(AccountService);
  readonly sync = inject(SyncService);

  readonly closed = output<void>();

  readonly email = signal('');
  readonly busy = signal(false);
  readonly loginError = signal<'invalid' | 'network' | null>(null);
  readonly emailValid = computed(() => EMAIL_PATTERN.test(this.email().trim()));

  async signIn(): Promise<void> {
    if (!this.emailValid() || this.busy()) return;
    this.busy.set(true);
    this.loginError.set(null);
    try {
      await this.accounts.login(this.email().trim());
    } catch (error) {
      this.loginError.set(error instanceof ApiError && error.status === 400 ? 'invalid' : 'network');
    } finally {
      this.busy.set(false);
    }
  }

  signOut(): void {
    this.accounts.logout();
  }

  close(): void {
    this.closed.emit();
  }
}
