import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AccountService } from '../../../services/account.service';
import { SyncService } from '../../../services/sync.service';

/** Account block of the Settings panel: who is signed in, how sync is doing, and sign-out. */
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
}
