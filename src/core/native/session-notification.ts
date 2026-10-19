import { Injector, effect, runInInjectionContext } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { TranslateService } from '@ngx-translate/core';
import { ClockService } from '../../services/clock.service';

const NOTIFICATION_ID = 1;
const CHANNEL_ID = 'session-end';
/** The in-app alarm takes over this long before the deadline while the app is on screen (see below). */
const FOREGROUND_HANDOVER_MS = 800;

/**
 * The WebView is frozen in the background, so the end-of-session sound cannot play there. While a session runs, a
 * local notification is scheduled for its deadline (`ClockService.endsAt`) and cancelled when the session is
 * paused, reset, switched or ends with the app on screen (the in-app bell and dialog cover that case).
 * Notifications are inexact on purpose (`allowWhileIdle`, no exact-alarm permission): they can arrive a little
 * late in Doze, and the app needs no special Play Console declaration. The permission is asked the first time the
 * user starts a session, never when the app opens; a session restored at launch only schedules when it was
 * already granted.
 */
export function startSessionNotification(injector: Injector): void {
  const clock = injector.get(ClockService);
  const translate = injector.get(TranslateService);

  // The plugin calls are queued so a cancel can never overtake the schedule it follows.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = (job: () => Promise<unknown>): void => {
    queue = queue.then(job).catch(() => undefined);
  };

  if (Capacitor.getPlatform() === 'android') {
    enqueue(() =>
      LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: translate.instant('clock.notificationTitle'),
        importance: 4,
        visibility: 1,
        vibration: true,
      }),
    );
  }

  const cancel = (): Promise<unknown> => LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });

  const schedule = async (endsAt: number, focus: boolean, mayAsk: boolean): Promise<void> => {
    let { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted' && mayAsk && (display === 'prompt' || display === 'prompt-with-rationale')) {
      display = (await LocalNotifications.requestPermissions()).display;
    }
    if (display !== 'granted' || endsAt <= Date.now()) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: translate.instant(focus ? 'chip.focusEnded' : 'chip.breakEnded'),
          body: translate.instant(focus ? 'clock.notificationBodyFocus' : 'clock.notificationBodyBreak'),
          schedule: { at: new Date(endsAt), allowWhileIdle: true },
          channelId: CHANNEL_ID,
          isExactNotification: false,
        },
      ],
    });
  };

  // The first run is a session restored from storage: scheduling is fine, asking for permission is not.
  let first = true;
  runInInjectionContext(injector, () => {
    effect((onCleanup) => {
      const endsAt = clock.endsAt();
      const running = clock.running();
      const focus = clock.mode() === 'focus';
      const mayAsk = !first;
      first = false;

      if (!running || endsAt === null) {
        enqueue(cancel);
        return;
      }
      enqueue(() => schedule(endsAt, focus, mayAsk));

      // With the app on screen the in-app bell rings at the deadline: pull the notification just before it so
      // the two do not double up. A hidden app (timers frozen, or the page not visible) keeps it.
      const timer = setTimeout(() => {
        if (document.visibilityState === 'visible') enqueue(cancel);
      }, Math.max(0, endsAt - Date.now() - FOREGROUND_HANDOVER_MS));
      onCleanup(() => clearTimeout(timer));
    });
  });

  // Back on screen: whatever was posted while away has been seen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') enqueue(() => LocalNotifications.removeAllDeliveredNotifications());
  });
}
