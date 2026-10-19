# Publicar Productivist en Google Play

Tutorial paso a paso. Supone que el [plan](PLAN.md) ya está implementado (`android/` existe y `npm run build:mobile` funciona). Los requisitos de Google cambian a menudo: si una pantalla de Play Console no coincide con lo que se describe aquí, manda lo que diga Play Console.

## 0. Lo que necesitas

- **Android Studio** (versión estable reciente) con el SDK que pida el proyecto (Android Studio lo ofrece al abrirlo).
- **JDK 21** (Android Studio ya trae uno).
- **Cuenta de Google Play Console**: pago único de 25 USD y verificación de identidad (documento oficial; si es una organización, número D-U-N-S).
- El dominio de producción de la web (lo llamaremos `https://productivist.example`). Debe servir ya:
  - `https://productivist.example/privacy.html`
  - `https://productivist.example/delete-account.html`
- **`CONTACT_EMAIL` sustituido** en `public/privacy.html` y `public/delete-account.html` por un email de contacto real, y desplegado.
- En Railway, la variable `CORS_ALLOWED_ORIGINS` del backend (si está definida) debe incluir `https://localhost` y `capacitor://localhost`.

> **Cuentas personales nuevas.** Google exige a las cuentas personales creadas después de noviembre de 2023 una **prueba cerrada con al menos 12 testers durante 14 días seguidos** antes de poder pedir acceso a producción. Empieza esa prueba pronto (paso 7) porque es lo que más tiempo lleva.

## 1. Construir la versión web para Android

```bash
API_URL=https://productivist.example npm run build:mobile
```

Esto genera el entorno móvil, compila Angular, sincroniza la versión de `package.json` con `android/app/build.gradle` (`versionName` 0.20.1 → `versionCode` 2001) y copia la web al proyecto nativo (`cap sync`).

**Cada subida a Play necesita un `versionCode` mayor que la anterior**, así que sube la versión en `package.json` antes de cada release.

## 2. Probar en un emulador o un móvil

```bash
npm run cap:android
```

En Android Studio: elige un emulador o un móvil conectado por USB (con la depuración USB activada) y pulsa *Run*. Comprueba:

- Arranca sin conexión y los datos se mantienen al cerrar y abrir.
- Login, sync y **Eliminar cuenta** (Configuración → Cuenta).
- Arranca un pomodoro corto, manda la app a segundo plano: llega la notificación al terminar.
- El botón atrás cierra modales y menús, vuelve de un proyecto y, en la vista principal, minimiza la app.
- Nada queda debajo de la barra de estado ni de la barra de gestos.

## 3. Crear la clave de subida (una sola vez)

Google firma la app que reciben los usuarios (*Play App Signing*, obligatorio). Tú firmas lo que subes con una **clave de subida**:

```bash
keytool -genkeypair -v -keystore ~/claves/productivist-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

- Guarda el `.jks` y sus contraseñas **fuera del repo** (gestor de contraseñas + copia de seguridad).
- Si la pierdes no pierdes la app: puedes pedir a Google un reseteo de la clave de subida desde Play Console, pero tarda días.

## 4. Generar el App Bundle firmado (.aab)

En Android Studio: **Build → Generate Signed App Bundle / APK… → Android App Bundle** → elige el `.jks`, el alias `upload` y sus contraseñas → variante **release** → *Create*.

El resultado queda en `android/app/release/app-release.aab` (Android Studio indica la ruta exacta al terminar).

> Alternativa por línea de comandos: configura `signingConfigs` en `android/app/build.gradle` leyendo un `keystore.properties` ignorado por git y ejecuta `cd android && ./gradlew bundleRelease`.

## 5. Crear la app en Play Console

1. [Play Console](https://play.google.com/console) → **Crear aplicación**.
2. Nombre: `Productivist`. Idioma predeterminado: español (o inglés). Tipo: **Aplicación**. Gratis.
3. Acepta las declaraciones (políticas del programa y leyes de exportación de EE. UU.).

## 6. Rellenar "Configura tu aplicación" (Panel → contenido de la app)

| Sección | Qué poner |
|---|---|
| Política de privacidad | `https://productivist.example/privacy.html` |
| Acceso a la app | La app funciona sin cuenta; la cuenta es opcional y sirve para sincronizar. Añade una cuenta de prueba (email + contraseña) para que el revisor pueda ver el sync. |
| Anuncios | No contiene anuncios. |
| Clasificación de contenido | Cuestionario IARC: categoría *Utilidad, productividad, comunicación u otra*; responde "No" a violencia, contenido sexual, etc. Sale para todos los públicos. |
| Público objetivo | 13+ o 18+ (evita marcar menores de 13: activa requisitos de *Familias*). |
| Seguridad de los datos | Ver tabla de abajo. |
| Apps gubernamentales, financieras, de salud | No. |

**Seguridad de los datos** (Data safety):

- ¿Recoge o comparte datos? **Sí recoge, no comparte.**
- Cifrado en tránsito: **Sí** (HTTPS).
- Los usuarios pueden pedir que se eliminen sus datos: **Sí** → URL `https://productivist.example/delete-account.html`.
- Tipos de datos recogidos (solo si el usuario crea cuenta, por eso son **opcionales**):
  - *Información personal → Dirección de correo electrónico*: funcionalidad de la app y gestión de la cuenta.
  - *Actividad en la app → Otro contenido generado por el usuario* (tareas, proyectos, objetivos): funcionalidad de la app.
- No se usan para publicidad ni analítica, ni se comparten con terceros.

## 7. Prueba interna y prueba cerrada

1. **Pruebas → Prueba interna → Crear versión** → sube el `.aab` → notas de versión → *Guardar* → *Revisar versión* → *Iniciar lanzamiento*. Añade tu email a la lista de testers y abre el enlace de participación en tu móvil. La prueba interna está disponible en minutos y sirve para comprobar que el bundle firmado funciona.
2. **Pruebas → Prueba cerrada** → crea una pista, añade al menos **12 testers** (lista de emails o un Grupo de Google), sube el mismo `.aab` y lanza. Los testers deben **aceptar la invitación y mantener la app instalada 14 días**.
3. Pasados los 14 días: **Panel → Solicitar acceso a producción** y responde el cuestionario sobre la prueba.

(Si tu cuenta es de organización o anterior a noviembre de 2023, puedes saltarte el paso 2.)

## 8. Ficha de Play Store (Crecer → Presencia en Play Store → Ficha principal)

- **Nombre** (30 caracteres): `Productivist`.
- **Descripción breve** (80): p. ej. *Pomodoro, Kanban, Matriz de Eisenhower y planificación diaria, sin conexión.*
- **Descripción completa** (4000): qué hace la app, que funciona sin conexión y sin cuenta, que la cuenta es opcional para sincronizar.
- **Icono**: 512×512 PNG. Exporta `resources/icon.png` a ese tamaño (`python3 -c "from PIL import Image; Image.open('resources/icon.png').resize((512,512)).save('play-icon.png')"`).
- **Gráfico destacado**: 1024×500 PNG o JPG.
- **Capturas de teléfono**: entre 2 y 8 (lado corto ≥ 320 px, proporción hasta 16:9 o 9:16). Hazlas desde el emulador (botón de cámara en la barra lateral). Las de tablet son opcionales.
- **Categoría**: Productividad. Email de contacto y, opcional, web.
- Repite la ficha en inglés en *Traducciones* si quieres publicarla en los dos idiomas.

## 9. Publicar en producción

1. **Producción → Países y regiones**: elige dónde se distribuye.
2. **Producción → Crear versión** → *Añadir desde la biblioteca* (el bundle que ya subiste) → notas de versión → *Revisar versión* → *Iniciar lanzamiento en producción*.
3. Google revisa la app (de horas a varios días la primera vez). Recibirás un email con el resultado.

## Siguientes versiones

1. Sube la versión en `package.json`.
2. `API_URL=https://productivist.example npm run build:mobile`
3. Genera el `.aab` firmado (paso 4).
4. Súbelo a prueba interna, compruébalo y **promociónalo** a producción (*Promocionar versión*).

## Problemas típicos

- **"El código de versión ya se ha usado"**: no subiste la versión en `package.json`, o no ejecutaste `build:mobile` después.
- **"Debe orientarse al nivel de API X"**: actualiza Capacitor (`npm i @capacitor/core@latest @capacitor/cli@latest @capacitor/android@latest` y `npx cap sync`) o sube `targetSdkVersion` en `android/variables.gradle`.
- **El login falla en la app pero no en la web**: falta `https://localhost` en `CORS_ALLOWED_ORIGINS`, o el build se hizo sin `API_URL`.
- **Rechazo por la política de eliminación de cuentas**: comprueba que `delete-account.html` es accesible sin iniciar sesión y explica los pasos.
