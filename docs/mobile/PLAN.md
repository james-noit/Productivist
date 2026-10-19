# Productivist en Google Play y App Store — plan de implementación

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Empaquetado | **Capacitor 8** (`@capacitor/core`, `cli`, `android`, `ios` 8.5.x) | La app es local-first: Capacitor sirve el `dist/` desde dentro del paquete (funciona sin red) y da acceso a APIs nativas (notificaciones, botón atrás). Una TWA dependería de la web online y no existe en iOS. |
| Ramas | **Todo en `main`**, sin rama móvil | El modelo de datos y los codecs de sync son comunes a web, Thunderbird y móvil. Se sigue el patrón de Thunderbird: una configuración de build + un script de entorno. |
| Carpetas nativas | `android/` e `ios/` **versionadas** en el repo | Son proyectos nativos que se editan (iconos, permisos, versión). Lo generado al sincronizar (`android/app/src/main/assets/public`, `ios/App/App/public`, `capacitor.config.json` copiados) queda ignorado por los `.gitignore` que crea Capacitor. |
| Identificador | `appId` = **`com.productivist.app`**, `appName` = `Productivist` | Es permanente una vez publicada la app: cámbialo en `capacitor.config.ts`, `android/app/build.gradle` (`namespace`, `applicationId`) y en Xcode (*Bundle Identifier*) **antes** de la primera subida si prefieres otro. |
| API | `API_URL=https://<dominio-del-frontend> npm run build:mobile` | Igual que `build:tb`: la WebView no está en el origen de la web, así que necesita URL absoluta; nginx sigue proxyando `/api/*`. Sin `API_URL` la app se construye sin sync. |
| Orígenes de la WebView | Android `https://localhost`, iOS `capacitor://localhost` | Hay que añadirlos a `CORS_ALLOWED_ORIGINS` del backend. |
| Versión | `versionName`/`CFBundleShortVersionString` = `package.json`; `versionCode`/`CFBundleVersion` = entero derivado (`major*10000 + minor*100 + patch`, p. ej. 0.20.1 → 2001) | Un script lo sincroniza en cada build, como `package-thunderbird.mjs`. Las tiendas exigen que el número de build crezca siempre. |
| Firma | Keystore de Android y certificados de Apple **fuera de git** | Perder el keystore de subida obliga a pedir a Google un reseteo; Apple gestiona los certificados en la cuenta. |

## Fases

### 1. Build web para móvil
- `scripts/write-mobile-environment.mjs`: genera `src/environments/environment.mobile.ts` (ignorado en git) desde `API_URL`, como el de Thunderbird.
- Configuración `mobile` en `angular.json` (sobre `production`): `fileReplacements` a `environment.mobile.ts`.
- Scripts npm:
  - `build:mobile` → entorno + `ng build --configuration production,mobile` + `node scripts/sync-mobile-version.mjs` + `npx cap sync`.
  - `cap:android` / `cap:ios` → `npx cap open android|ios`.
- `npm run check:lazy` debe seguir pasando y el bundle inicial no debe crecer de forma apreciable (nada de Capacitor en el bundle inicial; ver fase 3).

### 2. Proyectos nativos
- `capacitor.config.ts` en la raíz: `appId`, `appName`, `webDir: 'dist/productivist/browser'`, configuración de `SplashScreen` (fondo del tema claro, se oculta al arrancar Angular) y de `LocalNotifications` (icono pequeño en Android).
- `npx cap add android` y `npx cap add ios` (iOS con Swift Package Manager, el valor por defecto en Capacitor 8; no necesita CocoaPods).
- Android: `minSdk`/`targetSdk` los de la plantilla de Capacitor 8 (cumplen el requisito actual de Google Play); permiso `POST_NOTIFICATIONS` (lo declara el plugin) y `SCHEDULE_EXACT_ALARM` **no**: se usan notificaciones inexactas o `allowWhileIdle`, que no requieren declaración especial en Play Console.
- iOS: `Info.plist` con `CFBundleDisplayName`, orientaciones, `ITSAppUsesNonExemptEncryption = NO` (solo HTTPS estándar: evita la pregunta de exportación en cada subida). Privacy manifest (`PrivacyInfo.xcprivacy`) con las razones de uso de las APIs que exige Apple (`UserDefaults`, que usa Capacitor) y sin tracking.

### 3. Integración nativa (sin engordar el bundle inicial)
Toda la integración vive en `src/core/native/`, se carga con `import()` dinámico **solo si** `window.Capacitor?.isNativePlatform?.()` es `true` (el puente nativo inyecta ese global, así que detectar la plataforma no importa nada), y se arranca una vez desde `AppComponent`.
- **Alarma con la app en segundo plano.** La WebView se congela en segundo plano, así que el sonido de fin de sesión no sonaría. Al arrancar/reanudar una sesión se programa una notificación local para `endAt` (`@capacitor/local-notifications`) con el texto de "Focus ended"/"Break ended"; al pausar, resetear, cambiar de modo o terminar en primer plano se cancela. El permiso se pide la primera vez que el usuario pulsa *Start* (nunca al abrir la app). Un `effect` en el módulo nativo observa `ClockService` (`running`, `mode`, el `endAt` expuesto como señal de solo lectura si hace falta), así que `ClockService` no importa nada nativo.
- **Botón atrás de Android** (`@capacitor/app`): despacha un `keydown` `Escape` sintético sobre `document.activeElement` (o `body`), que es lo que ya cierran modales, menús, el drawer y el modo foco, y lo que hace volver de un proyecto. Si no hay ningún `[aria-modal="true"]` abierto y la vista actual es la raíz (`projects` o `pomodoro` sin proyecto activo), minimiza la app (`App.minimizeApp()`) en vez de cerrarla.
- **Barra de estado y safe areas.** `viewport-fit=cover` en `index.html` y `env(safe-area-inset-*)` en la cabecera, el cuerpo y los elementos fijos que no lo tengan aún (el FAB y el drawer ya lo usan). En navegador `env()` vale 0, así que la web no cambia. Android 15+ fuerza edge-to-edge con `targetSdk` 35+: con el inset aplicado no hay solapes.
- **Splash**: se oculta en `AppComponent` tras el primer render (`SplashScreen.hide()` dentro del mismo módulo dinámico).
- **Persistencia.** Los datos están en `localStorage` de la WebView, que en Android e iOS (esquema propio de Capacitor) es persistente. Riesgo conocido: iOS puede borrar datos de WebView en situaciones extremas de falta de espacio. Mitigación ya existente: el sync. Mitigación futura (fuera de este plan): espejar `productivist.*` en `@capacitor/preferences`.

### 4. Iconos y pantalla de arranque
- `scripts/draw-app-icon.py` (Pillow, como `draw-alarm-clock.py`): redibuja el icono de `extension/icons/icon.png` a 1024×1024 sin transparencia en `resources/icon.png`, y genera `resources/icon-foreground.png` + `resources/icon-background.png` (icono adaptativo de Android) y `resources/splash.png`/`splash-dark.png` (2732×2732).
- `npx @capacitor/assets generate` produce todos los tamaños en `android/` e `ios/`.
- Gráficos de ficha (no van en el repo): icono de Play 512×512, gráfico destacado 1024×500, capturas. Ver tutoriales.

### 5. Backend y web pública
- `CORS_ALLOWED_ORIGINS` por defecto en `application.yml` incluye `https://localhost` y `capacitor://localhost` (y documentarlo en `backend/README.md`). En Railway hay que añadirlos también a la variable si está definida.
- Páginas estáticas en `public/` (servidas por nginx en el dominio de la web), en inglés y español:
  - `privacy.html`: política de privacidad (qué se guarda: email, hash de contraseña, tareas/proyectos/etc. sincronizados; dónde: Railway; sin publicidad, analítica ni tracking; datos locales en el dispositivo; cómo borrar la cuenta). Contacto: marcador `CONTACT_EMAIL` que el responsable rellena antes de publicar.
  - `delete-account.html`: cómo borrar la cuenta desde la app (Configuración → Cuenta → Eliminar cuenta) y qué se borra; Google Play exige esta URL fuera de la app.
  - Ambas sin scripts inline (por la CSP de la extensión de Thunderbird, que también copia `public/`).
- Enlace a la política de privacidad desde el bloque de cuenta (`account-settings`), requisito de Apple para apps con cuenta. Clave nueva y breve en `en.json`/`es.json`.

### 6. Documentación
- `AGENTS.md`: sección **Mobile apps** (scripts, `capacitor.config.ts`, `src/core/native/`, reglas: nada nativo en el bundle inicial, `environment.mobile.ts` ignorado, versión sincronizada, orígenes CORS).
- Tutoriales: [`google-play.md`](google-play.md) y [`app-store.md`](app-store.md).

## Verificación
- En Linux: `npm run build`, `npm run check:lazy`, `API_URL=https://example.com npm run build:mobile` (build + `cap sync` sin errores), `npm run build:tb` sigue funcionando, backend `./mvnw -q compile` si se toca Java.
- Android (requiere Android Studio): `npm run cap:android` → *Run* en un emulador; comprobar arranque sin red, login/sync, alarma con la app en segundo plano, botón atrás, safe areas.
- iOS (requiere macOS + Xcode): `npm run cap:ios` → *Run* en simulador y en un dispositivo; mismas comprobaciones.

## Fuera de alcance
- Subir a las tiendas, crear cuentas de desarrollador, capturas y textos de ficha (ver tutoriales).
- CI de firma y subida automática (fastlane / Gradle Play Publisher), widgets, notificaciones push.
