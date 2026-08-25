import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MultitaskService } from '../../../services/multitask.service';

@Component({
  selector: 'app-multitask-toggle',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './multitask-toggle.component.html',
  styleUrl: './multitask-toggle.component.css',
})
export class MultitaskToggleComponent {
  readonly multitask = inject(MultitaskService);

  onToggle(): void {
    if (this.multitask.enabled()) this.multitask.setEnabled(false);
    else this.multitask.enableWithCurrentTask();
  }
}
