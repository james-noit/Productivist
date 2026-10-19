import { Injector } from '@angular/core';
import { App } from '@capacitor/app';
import { ClockService } from '../../services/clock.service';
import { ViewService } from '../../services/view.service';

/** Anything that is on top of the page and has its own way out: a dialog, a menu, the Flow focus mode, a drawer. */
const OVERLAYS = '[aria-modal="true"], .modal-overlay, [role="dialog"], [role="alertdialog"], [role="menu"]';

/**
 * The Android back button. The app already closes a modal, a menu, the drawer or the Flow focus mode with
 * Escape, and leaves a project with it, so the button just sends an Escape: the same code path as the keyboard.
 * With nothing open on a root view (Tasks and projects, Pomodoro) it minimizes the app instead of closing it.
 */
export function startBackButton(injector: Injector): void {
  const view = injector.get(ViewService);
  const clock = injector.get(ClockService);

  void App.addListener('backButton', () => {
    const overlay = document.querySelector<HTMLElement>(OVERLAYS);
    // A ringing alarm is stopped by Escape (the header's button), so it counts as something to close.
    if (!overlay && !clock.ringing()) {
      const current = view.current();
      if (current === 'projects' || current === 'pomodoro') {
        void App.minimizeApp();
        return;
      }
      if (current === 'admin') {
        view.setView('projects');
        return;
      }
    }
    // Focus is on <body> after a tap on a non-focusable spot: send the key to the topmost dialog so handlers
    // bound on the dialog itself (not on the document) see it too.
    const active = document.activeElement;
    const modals = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
    const target = active && active !== document.body ? active : (modals[modals.length - 1] ?? document.body);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  });
}
