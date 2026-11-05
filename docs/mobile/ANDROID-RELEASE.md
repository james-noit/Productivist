# Productivist on Google Play (and Android widgets) — plan

Status: plan, nothing below is implemented yet unless marked ✅. Builds on [`PLAN.md`](PLAN.md) (the Capacitor packaging, already done) and the step-by-step console tutorial [`google-play.md`](google-play.md). This document is the checklist from "the project builds" to "the app is live on Google Play", plus the slot for the home-screen widgets.

## Where we are (0.26.4)

| Area | State |
|---|---|
| Capacitor 8 project in `android/`, `appId` `com.productivist.app` | ✅ |
| `npm run build:mobile` (environment, `production,mobile` build, version sync, `cap sync`) | ✅ |
| Native layer in `src/core/native/` (back button, end-of-session notification, splash), lazy | ✅ |
| Icons, adaptive icon, splash, monochrome notification icon | ✅ |
| `minSdk` 24, `targetSdk`/`compileSdk` 36, no `SCHEDULE_EXACT_ALARM` | ✅ |
| WebView origins in the backend's default CORS list | ✅ (Railway variable still to check) |
| `privacy.html`, `delete-account.html`, in-app account deletion | ✅ pages exist, **`CONTACT_EMAIL` still a placeholder** |
| `android/app/build.gradle` committed version | stale (`0.24.0` / 2400; `build:mobile` rewrites it, commit it after each release build) |
| Release signing from the command line | ❌ (only via Android Studio's wizard) |
| Release build shrinking (`minifyEnabled`) | ❌ off |
| Backup rules for the WebView data | ❌ default `allowBackup="true"`, no rules |
| CI / automated upload | ❌ |
| Play Console account, listing, testing tracks | ❌ |
| Widgets | to be determined (see phase 8) |

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Distribution | Google Play only to start (AAB, Play App Signing). F-Droid / direct APK: later, optional. | Play is where the users are; Play App Signing is mandatory for new apps. |
| Package name | Keep `com.productivist.app`. | Permanent after the first upload; changing it later means a new app with no users. Confirm it once more before phase 4. |
| Versioning | `package.json` stays the single source; `versionCode = major*10000 + minor*100 + patch`. | Already implemented by `scripts/sync-mobile-version.mjs`; minor and patch must stay below 100. A hotfix rebuild of the same version is impossible (Play rejects a reused code): bump the patch. |
| Signing | Upload key in a keystore **outside git**, read by Gradle from `android/keystore.properties` (git-ignored) or environment variables. | Lets `./gradlew bundleRelease` and CI sign without Android Studio. |
| Release cadence | Every web release that touches the app ships to the internal track; promoted to production by hand. | Keeps production behind one human check. |
| Account type | Decide early: **personal** (needs the 12 testers × 14 days closed test) or **organisation** (D-U-N-S number, no closed-test requirement). | It decides the critical path (see the timeline). |

## Phases

### 1. Pre-flight fixes in the repo (½–1 day)

1. **Contact address.** Replace `CONTACT_EMAIL` in `public/privacy.html` and `public/delete-account.html` with a real address (both languages), deploy the web, check both URLs answer without signing in.
2. **CORS in production.** If Railway's `CORS_ALLOWED_ORIGINS` is set, make sure it lists `https://localhost` and `capacitor://localhost` (`backend/README.md`). Test a login from the emulator against production.
3. **Version in git.** Run `API_URL=… npm run build:mobile` and commit the rewritten `android/app/build.gradle` (and the Xcode project) so the repo matches the released version.
4. **Command-line signing.** In `android/app/build.gradle` add a `signingConfigs.release` that reads `storeFile`, `storePassword`, `keyAlias`, `keyPassword` from `android/keystore.properties` if it exists, else from `PRODUCTIVIST_UPLOAD_*` environment variables, and use it in `buildTypes.release`; without either the release build stays unsigned (no failure for contributors). Add `keystore.properties` and `*.jks`/`*.keystore` to `android/.gitignore`. Add an npm script `bundle:android` = `build:mobile` + `cd android && ./gradlew bundleRelease`.
5. **Shrinking.** Turn on `minifyEnabled true` + `shrinkResources true` for release, keep Capacitor's ProGuard rules (`proguard-android-optimize.txt` + the plugins' consumer rules). Verify in a release build on a device that the bridge, notifications and the back button still work; if anything breaks, add keep rules or switch it back off and note it here.
6. **Backups.** The WebView's `localStorage` holds the tasks *and* `productivist.account` (the session token) and `productivist.forgeConnections` (Git tokens). Add `android:dataExtractionRules` (Android 12+) and `android:fullBackupContent` (older) that exclude the WebView storage from cloud backup and device-to-device transfer, *or* keep the data and accept that a restored device starts signed in. Recommended: exclude only from cloud backup, allow device transfer; document the choice. (Tokens restored on a new device must never be treated as a bug.)
7. **Release smoke test** (emulator + one real phone, release build signed with the upload key): offline start, data survives a force-stop, login/sync, delete account, end-of-session notification with the app in background and with the screen off, permission prompt only on the first *Start*, back button everywhere (modals, drawer, Flow focus mode, menus), safe areas on a gesture-navigation phone and a 3-button one, dark theme, Spanish, rotation and a tablet/foldable window size, Git forge import with the native transport, Sportask break modal.

### 2. Play Console account (1 day of work, up to a few days of verification)

- Create the developer account (USD 25, identity verification; organisation: D-U-N-S first).
- Set up the developer page, contact email and, for organisations, the website verification.
- Generate the **upload key** (`keytool …`, see `google-play.md` §3); store it and its passwords in a password manager plus an offline backup. Never in git, never in the repo's CI logs.

### 3. App entry and policy declarations (½ day)

Fill *App content* as described in `google-play.md` §6: privacy policy URL, app access (no account needed; give the reviewer a test account for sync), ads (none), content rating (IARC questionnaire), target audience (13+ or 18+, not under 13), data safety (email and user content, optional, collected not shared, encrypted in transit, deletion URL), not a government/financial/health app. Notifications: the app only posts local notifications, no foreground service, no exact alarms, so no special permission declaration.

### 4. Store listing (1–2 days, mostly assets)

- Texts in English and Spanish: name (30), short description (80), full description (4000). Lead with: works offline and without an account; Pomodoro + Kanban + Eisenhower + Plan my day + Flow; optional sync.
- Graphics: 512×512 icon (from `resources/icon.png`), 1024×500 feature graphic, 4–8 phone screenshots per language (Pomodoro with a task, Tasks and projects, a Kanban board, Plan my day, Flow, Sportask), optional 7"/10" tablet screenshots. Take them from the emulator with demo data (an export file kept under `docs/mobile/demo-data.json` makes them reproducible; no personal data).
- Category *Productivity*, tags, contact email, website.

### 5. Testing tracks (critical path: ~3 weeks for a personal account)

1. **Internal testing**: upload the first signed AAB, install it through the opt-in link, repeat the smoke test from phase 1 on the Play-signed build (Play re-signs it; this is the first time the real signature runs).
2. **Pre-launch report**: read Play's automatic crawl results (crashes, accessibility, security warnings) and fix what is real.
3. **Closed testing** (personal accounts only): at least 12 testers opted in and keeping the app installed for 14 consecutive days. Recruit them before you need them (a Google Group makes the list easy to manage). Ship at least one update during the 14 days, it shows Google an active test. Collect feedback in a short form.
4. Apply for production access, answer the questionnaire about the test.

### 6. Production release

- Countries and regions, then promote the tested release to production with a **staged rollout** (e.g. 20 % → 50 % → 100 % over a few days), watching *Android vitals* (crash and ANR rate) between steps.
- First review can take from hours to a week; keep the internal track for the next version meanwhile.

### 7. After launch: release pipeline and maintenance

- **Release checklist** per version: bump `package.json`, `npm run bundle:android`, commit the synced versions, upload to internal, smoke test, promote with staged rollout, release notes in both languages.
- **Automation (optional, once the manual path is boring):** a GitHub Actions workflow on a `v*` tag that builds the web, runs `check:lazy` and `check:sportask`, builds the signed AAB with the keystore from repository secrets and uploads it to the internal track (Gradle Play Publisher or `fastlane supply`, with a Play service account restricted to this app). Production promotion stays manual.
- **Yearly target-API deadline:** Google requires new targets every August (target API level of the previous year's Android). Plan a Capacitor/`variables.gradle` update each spring; `targetSdk` 36 covers 2026.
- **Watch:** Android vitals, reviews (reply in the review's language), policy emails from Play Console (data safety and account deletion are re-checked periodically).
- **Keep `docs/mobile/google-play.md` and `AGENTS.md` (*Mobile apps*) current** when signing, scripts or targets change.

### 8. Home-screen widgets

**To be determined in the future.** Scope, widget types, data access, technology and design will be planned in their own document once the app is published.

## Timeline (personal account)

| Week | Work |
|---|---|
| 1 | Phases 1–3: pre-flight fixes, account, declarations; first internal release |
| 1–2 | Phase 4: listing and screenshots; recruit testers |
| 2–4 | Phase 5: closed test (14 days running), fixes from the pre-launch report and testers |
| 4–5 | Production access request, review, staged rollout |
| later | Phase 7 automation; phase 8 widgets (TBD) |

An organisation account skips the closed test: roughly 1–2 weeks to production.

## Risks

| Risk | Mitigation |
|---|---|
| Lost upload key | Password manager + offline backup; Play can reset the upload key (takes days). |
| Not enough closed testers / someone uninstalls before day 14 | Recruit 15–20, remind them, count from the day the 12th opted in. |
| Shrinking breaks the bridge | Release build tested on a device before every upload; fall back to `minifyEnabled false`. |
| WebView data loss (storage cleared by the user or the system) | Sync, export file; documented in the listing's FAQ. |
| Background notification delayed by Doze / OEM battery savers | Inexact by design; mention in the FAQ how to exempt the app from battery optimisation on aggressive OEMs. |
| Policy rejection (data safety, account deletion, permissions) | Declarations match `privacy.html`; `delete-account.html` reachable without signing in; no permission beyond what the plugins need. |
