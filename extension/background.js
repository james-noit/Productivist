// Opens Productivist in a Thunderbird tab, or focuses the tab that is already open.
const APP_URL = browser.runtime.getURL('app/index.html');

browser.browserAction.onClicked.addListener(async () => {
  const existing = await browser.tabs.query({ url: APP_URL });
  if (existing.length > 0) {
    await browser.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId !== undefined) {
      await browser.windows.update(existing[0].windowId, { focused: true });
    }
    return;
  }
  await browser.tabs.create({ url: APP_URL });
});
