// Opens Productivist in a Thunderbird tab, or focuses the tab that is already open.
// The tab id is remembered instead of found with tabs.query({ url }), which needs the
// "tabs" permission and throws without it.
const APP_URL = browser.runtime.getURL('app/index.html');
let appTabId = null;

browser.tabs.onRemoved.addListener((tabId) => {
  if (tabId === appTabId) appTabId = null;
});

browser.browserAction.onClicked.addListener(async () => {
  try {
    if (appTabId !== null) {
      try {
        const tab = await browser.tabs.update(appTabId, { active: true });
        await browser.windows.update(tab.windowId, { focused: true });
        return;
      } catch {
        appTabId = null; // the tab is gone; open a new one
      }
    }
    const tab = await browser.tabs.create({ url: APP_URL });
    appTabId = tab.id;
  } catch (error) {
    console.error('Productivist: could not open the app tab', error);
  }
});
