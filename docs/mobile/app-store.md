# Publicar Productivist en la App Store

Tutorial paso a paso. Supone que el [plan](PLAN.md) ya está implementado (`ios/` existe y `npm run build:mobile` funciona). Si una pantalla de App Store Connect o de Xcode no coincide con lo que se describe aquí, manda lo que digan ellas: Apple cambia los requisitos cada año.

## 0. Lo que necesitas

- **Un Mac** con la versión de **Xcode** que exige Apple para subir apps (desde abril de 2026, Xcode 26 con el SDK de iOS 26). No se puede compilar ni subir una app de iOS desde Linux.
- **Node 22 o superior** en ese Mac y el repo clonado (`npm install`).
- **Apple Developer Program**: 99 USD al año. Como particular basta tu Apple ID con verificación en dos pasos; como organización necesitas un número D-U-N-S. La aprobación puede tardar de horas a un par de días.
- El dominio de producción de la web (lo llamaremos `https://productivist.example`) sirviendo `privacy.html` y `delete-account.html`, con **`CONTACT_EMAIL` ya sustituido** por un email real.
- En Railway, `CORS_ALLOWED_ORIGINS` del backend (si está definida) debe incluir `capacitor://localhost` y `https://localhost`.

## 1. Construir la versión web para iOS

En el Mac:

```bash
API_URL=https://productivist.example npm run build:mobile
```

Compila Angular, sincroniza la versión de `package.json` con el proyecto de Xcode (`MARKETING_VERSION` 0.20.1, `CURRENT_PROJECT_VERSION` 2001) y copia la web a `ios/` (`cap sync`). **Cada build que subas necesita un número de build mayor**: sube la versión en `package.json` antes de cada release.

## 2. Abrir el proyecto y configurar la firma

```bash
npm run cap:ios
```

En Xcode:

1. **Xcode → Settings → Accounts** → añade tu Apple ID.
2. En el navegador de la izquierda selecciona el proyecto **App** → target **App** → pestaña **Signing & Capabilities**:
   - Marca **Automatically manage signing**.
   - **Team**: tu equipo del Developer Program.
   - **Bundle Identifier**: `com.productivist.app` (el mismo que `capacitor.config.ts`; es permanente una vez publicada la app).
   - Xcode crea el identificador y los certificados.
3. Pestaña **General**:
   - *Display Name*: `Productivist`.
   - *Minimum Deployments*: deja el de la plantilla de Capacitor.
   - *Supported Destinations*: si **no** quieres preparar capturas de iPad, quita iPad (y "Mac (Designed for iPad)" / "Apple Vision"). Si lo dejas, Apple exige capturas de iPad.
4. Comprueba que `PrivacyInfo.xcprivacy` aparece dentro de la carpeta *App* del proyecto. Si no aparece: *File → Add Files to "App"…* → `ios/App/App/PrivacyInfo.xcprivacy`, marcando el target *App*.

## 3. Probar en el simulador y en un iPhone

Elige un simulador (o tu iPhone conectado por cable; la primera vez, en el iPhone: *Ajustes → Privacidad y seguridad → Modo de desarrollador*) y pulsa ▶. Comprueba:

- Arranca sin conexión y los datos se mantienen al cerrar y abrir.
- Login, sync y **Eliminar cuenta** (Configuración → Cuenta).
- Un pomodoro corto con la app en segundo plano muestra la notificación al terminar (en el simulador funciona; el permiso se pide al pulsar *Start*).
- Nada queda bajo la *notch*, la *Dynamic Island* ni la barra de inicio.
- El enlace a la política de privacidad abre.

## 4. Crear la app en App Store Connect

[App Store Connect](https://appstoreconnect.apple.com) → **Apps → + → Nueva app**:

- Plataforma: **iOS**.
- Nombre: `Productivist` (único en toda la App Store; si está cogido, p. ej. `Productivist: Pomodoro & Tasks`).
- Idioma principal: español o inglés.
- ID de paquete: `com.productivist.app` (aparece si el paso 2 lo registró).
- SKU: cualquier código interno, p. ej. `productivist-ios`.
- Acceso de usuarios: acceso total.

## 5. Subir el build

1. En Xcode, como destino elige **Any iOS Device (arm64)**.
2. **Product → Archive**. Al terminar se abre el *Organizer*.
3. **Distribute App → App Store Connect → Upload** → deja las opciones por defecto (firma automática, subir símbolos) → *Upload*.
4. En 10–30 minutos el build aparece en App Store Connect → tu app → **TestFlight**. No debería preguntarte por cifrado de exportación (`ITSAppUsesNonExemptEncryption = NO` en `Info.plist`); si lo hace, responde que solo usa el cifrado estándar del sistema (HTTPS) y está exenta.

## 6. TestFlight (recomendado antes de enviar a revisión)

- **Pruebas internas**: añade tu Apple ID (y hasta 100 miembros del equipo). Instala la app **TestFlight** en el iPhone y prueba el build real firmado.
- **Pruebas externas** (opcional, hasta 10 000 testers por enlace público): el primer build pasa una revisión beta corta.

## 7. Ficha de la App Store (pestaña de la versión, p. ej. *iOS App 0.20.1*)

- **Capturas**: obligatorias las de iPhone de **6,9"** (1320×2868 o 1290×2796, vertical), entre 1 y 10. Hazlas en el simulador *iPhone 17 Pro Max* (o el mayor disponible) con ⌘S. Si mantuviste iPad, también las de **iPad 13"** (2064×2752).
- **Texto promocional** (170 caracteres, se puede cambiar sin revisión).
- **Descripción** (4000): qué hace, que funciona sin conexión y sin cuenta, y que la cuenta es opcional para sincronizar.
- **Palabras clave** (100 caracteres, separadas por comas): `pomodoro,kanban,eisenhower,tareas,productividad,planificador,proyectos,foco`.
- **URL de soporte** (obligatoria): p. ej. la web o una página de contacto.
- **URL de la política de privacidad** (en *Información de la app*): `https://productivist.example/privacy.html`.
- **Categoría** (en *Información de la app*): Productividad; secundaria opcional.
- **Copyright**: `2026 <tu nombre>`.
- **Build**: elige el que subiste en el paso 5.

## 8. Privacidad de la app (etiquetas de privacidad)

App Store Connect → **Privacidad de la app → Empezar**:

- ¿Recoges datos? **Sí.**
- **Información de contacto → Dirección de correo electrónico**: uso *Funcionalidad de la app*; **vinculado** a la identidad del usuario; **no** se usa para rastreo.
- **Contenido del usuario → Otro contenido del usuario** (tareas, proyectos): *Funcionalidad de la app*; vinculado; sin rastreo.
- Nada más (sin analítica, sin anuncios, sin identificadores, sin ubicación).

## 9. Resto de formularios

- **Clasificación por edades**: responde "Ninguno/No" a todo (sin contenido generado por otros usuarios visible, sin chat, sin web abierta) → la clasificación más baja.
- **Precio y disponibilidad**: Gratis; países.
- **Ley de Servicios Digitales de la UE** (*Business → Cumplimiento*): declara si eres comerciante. Si lo eres, Apple publica tu dirección y teléfono en la ficha de la UE; si no, no se distribuye como comerciante.
- **Información para la revisión de la app**:
  - *Se requiere inicio de sesión*: no es obligatorio, pero añade una **cuenta de demostración** (email + contraseña) para que el revisor vea el sync y la eliminación de cuenta.
  - *Notas*: algo como: "Productivist funciona sin cuenta y sin conexión (los datos se guardan en el dispositivo). La cuenta es opcional y sirve para sincronizar entre dispositivos. Se puede eliminar desde Configuración → Cuenta → Eliminar cuenta. El temporizador Pomodoro avisa con una notificación local cuando la app está en segundo plano."
  - Datos de contacto.

## 10. Enviar a revisión

**Añadir para revisión → Enviar a revisión de la App Store.** Suele resolverse en 24–48 h. Puedes elegir publicar automáticamente al aprobarse o manualmente.

### Rechazos posibles y cómo responder

- **4.2 Funcionalidad mínima** ("es solo una web empaquetada"): explica en la respuesta que funciona sin conexión con los datos en el dispositivo, que usa notificaciones locales para el temporizador y que tiene un flujo completo de planificación (Kanban, Eisenhower, hoja de ruta, calendario, Flow). Adjunta capturas de esas vistas.
- **5.1.1(v) Eliminación de cuenta**: ya está dentro de la app; indica la ruta exacta en las notas.
- **2.1 Información incompleta**: suele ser la cuenta de demostración o un enlace roto (privacidad o soporte).
- **Metadatos**: no menciones Android, precios ni "beta" en la ficha ni en las capturas.

## Siguientes versiones

1. Sube la versión en `package.json`.
2. `API_URL=https://productivist.example npm run build:mobile`
3. Xcode → **Product → Archive → Distribute App** (paso 5).
4. App Store Connect → **+ Versión** (con el nuevo número), elige el build, rellena *Novedades de esta versión* y envía a revisión.

## Problemas típicos

- **"Redundant Binary Upload" / build duplicado**: el número de build no ha subido; actualiza `package.json` y vuelve a ejecutar `build:mobile`.
- **"Missing Compliance"** en TestFlight: falta `ITSAppUsesNonExemptEncryption` en `Info.plist`; respóndelo en App Store Connect para ese build.
- **"ITMS-91053: Missing API declaration"**: falta `PrivacyInfo.xcprivacy` en el target (paso 2.4) o una razón de API nueva que haya añadido un plugin.
- **El login falla en la app pero no en la web**: falta `capacitor://localhost` en `CORS_ALLOWED_ORIGINS`, o el build se hizo sin `API_URL`.
- **No hay sonido al terminar con la pantalla bloqueada**: es lo esperado; avisa la notificación local (con su sonido del sistema).
