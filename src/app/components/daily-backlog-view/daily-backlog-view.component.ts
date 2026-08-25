import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-daily-backlog-view',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './daily-backlog-view.component.html',
  styleUrl: './daily-backlog-view.component.css',
})
export class DailyBacklogViewComponent {}
