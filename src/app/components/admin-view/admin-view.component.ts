import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminService } from '../../../services/admin.service';
import { AccountService } from '../../../services/account.service';
import { AdminUserModalComponent } from '../admin-user-modal/admin-user-modal.component';

/** Account moderation for the backend's admin: stats, a searchable user list and an editor per account. */
@Component({
  selector: 'app-admin-view',
  standalone: true,
  imports: [DatePipe, TranslatePipe, AdminUserModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-view.component.html',
  styleUrl: './admin-view.component.css',
})
export class AdminViewComponent {
  readonly admin = inject(AdminService);
  readonly accounts = inject(AccountService);

  private readonly selectedId = signal<number | null>(null);
  /** Derived from the list, so the editor follows edits and closes by itself when its user is deleted. */
  readonly selected = computed(() => {
    const id = this.selectedId();
    return id === null ? null : (this.admin.users().find((user) => user.id === id) ?? null);
  });

  constructor() {
    void this.admin.refresh();
  }

  /** The admin account itself is managed in the Settings panel like any other, not here. */
  isSelf(email: string): boolean {
    return email === this.accounts.account()?.email;
  }

  onSearch(event: Event): void {
    this.admin.setQuery((event.target as HTMLInputElement).value);
  }

  open(id: number): void {
    this.selectedId.set(id);
  }

  close(): void {
    this.selectedId.set(null);
  }
}
