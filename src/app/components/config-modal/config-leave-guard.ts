import { Injectable } from '@angular/core';

/**
 * Lets a section of the Configuration modal ask before the modal changes section or closes (today: the Sportask setup wizard with a
 * dirty draft). Provided by `ConfigModalComponent` (never root, so it lives and dies with the dialog) and injected optionally by
 * the section. `check(proceed)` returns true when leaving is fine now; otherwise it asks its own question and calls `proceed`
 * itself if the answer is yes.
 */
@Injectable()
export class ConfigLeaveGuard {
  private check: ((proceed: () => void) => boolean) | null = null;

  register(check: (proceed: () => void) => boolean): () => void {
    this.check = check;
    return () => {
      if (this.check === check) this.check = null;
    };
  }

  leave(proceed: () => void): void {
    if (!this.check || this.check(proceed)) proceed();
  }
}
