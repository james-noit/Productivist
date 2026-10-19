import { Injector } from '@angular/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { startBackButton } from './back-button';
import { startSessionNotification } from './session-notification';

/**
 * Everything the Capacitor apps (Android, iOS) add on top of the web app. This module, and everything under
 * `src/core/native/`, is reached only through the dynamic `import()` in `AppComponent`, behind a check that the
 * native bridge exists, so none of it (nor any `@capacitor/*` package) lands in the initial bundle or is ever
 * fetched by the web build or the Thunderbird add-on. Nothing outside this folder may import it.
 */
export function startNative(injector: Injector): void {
  startBackButton(injector);
  startSessionNotification(injector);
  hideSplashAfterFirstRender();
}

/** The splash stays up (`launchAutoHide: false` in capacitor.config.ts) until Angular has painted once. */
function hideSplashAfterFirstRender(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => void SplashScreen.hide().catch(() => undefined)));
}
