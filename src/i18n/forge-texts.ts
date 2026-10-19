/**
 * Strings of the Git forge import (Configuration > Integrations, the import dialog, the linked-project strip and the
 * Task Details link). They live here, not in the locale files, because `en.json` is bundled eagerly and these are only
 * used by lazy components: `lib/forge-texts.ts` merges them into ngx-translate the first time one of those opens.
 * `forge.fab` (the floating menu entry, rendered with the Tasks and projects page) and `config.integrations` stay in the
 * locale files.
 */
export const FORGE_TEXTS: Record<'en' | 'es', Record<string, unknown>> = {
  en: {
    "account": "Account",
    "none": "Connect a Git account first.",
    "goSettings": "Open Integrations",
    "search": "Search, or type owner/name",
    "private": "Private",
    "imported": "Imported",
    "issues": "{{n}} open issues",
    "more": "Load more",
    "empty": "No repositories found.",
    "opt": {
      "closed": "Include closed issues",
      "mine": "Only issues assigned to me",
      "milestones": "Import milestones",
      "labels": "Labels as tags"
    },
    "import": "Import",
    "refresh": "Refresh",
    "reading": {
      "milestones": "Reading milestones…",
      "issues": "Importing {{n}} issues…"
    },
    "result": "{{m}} milestones and {{t}} tasks created, {{u}} updated.",
    "capped": "Only the newest 2,000 issues were read.",
    "open": "Open project",
    "err": {
      "cors": "The server blocked the request (CORS). A self-hosted Gitea or Forgejo must allow this app's origin.",
      "auth": "Token rejected.",
      "notFound": "Not found: the repository is private or the token lacks access.",
      "rateLimited": "Rate limited. Try again in a while.",
      "network": "Could not reach the server.",
      "server": "The server returned an error.",
      "relay": "The Productivist server could not fetch it (refused address, or you are signed out).",
      "host": "Enter a valid address."
    },
    "accounts": {
      "hint": "The token stays on this device. Use a read-only token.",
      "add": "Add account",
      "platform": "Platform",
      "host": "Address",
      "token": "Access token",
      "create": "Create a token",
      "save": "Test and save",
      "remove": "Remove",
      "test": "Test",
      "ok": "Connected as @{{user}}",
      "removeQ": "Remove this account? Imported projects stay.",
      "keep": "Keep"
    },
    "transport": {
      "extension": "Allow access to this server",
      "extensionHint": "Thunderbird will ask permission to contact it directly.",
      "native": "Use this device's network stack",
      "nativeHint": "The app contacts the server itself, without browser limits.",
      "relay": "Use the Productivist server",
      "relayHint": "Your token passes through it, and is not stored.",
      "denied": "Permission was not granted."
    },
    "synced": "Synced {{time}}",
    "never": "Not synced yet",
    "connect": "Connect {{name}} to refresh",
    "openOn": "Open on {{name}}",
    "from": "Imported from {{ref}}",
    "hint": "A refresh may replace the title and description with the issue's."
  },
  es: {
    "account": "Cuenta",
    "none": "Conecta primero una cuenta de Git.",
    "goSettings": "Abrir Integraciones",
    "search": "Busca, o escribe propietario/nombre",
    "private": "Privado",
    "imported": "Importado",
    "issues": "{{n}} incidencias abiertas",
    "more": "Cargar más",
    "empty": "No se encontraron repositorios.",
    "opt": {
      "closed": "Incluir incidencias cerradas",
      "mine": "Solo las asignadas a mí",
      "milestones": "Importar hitos",
      "labels": "Etiquetas como tags"
    },
    "import": "Importar",
    "refresh": "Actualizar",
    "reading": {
      "milestones": "Leyendo hitos…",
      "issues": "Importando {{n}} incidencias…"
    },
    "result": "{{m}} hitos y {{t}} tareas creados, {{u}} actualizadas.",
    "capped": "Solo se leyeron las 2.000 incidencias más recientes.",
    "open": "Abrir proyecto",
    "err": {
      "cors": "El servidor bloqueó la petición (CORS). Un Gitea o Forgejo propio debe permitir el origen de esta app.",
      "auth": "Token rechazado.",
      "notFound": "No encontrado: el repositorio es privado o el token no tiene acceso.",
      "rateLimited": "Límite de peticiones. Inténtalo más tarde.",
      "network": "No se pudo conectar con el servidor.",
      "server": "El servidor devolvió un error.",
      "relay": "El servidor de Productivist no pudo obtenerlo (dirección rechazada, o la sesión está cerrada).",
      "host": "Introduce una dirección válida."
    },
    "accounts": {
      "hint": "El token se queda en este dispositivo. Usa un token de solo lectura.",
      "add": "Añadir cuenta",
      "platform": "Plataforma",
      "host": "Dirección",
      "token": "Token de acceso",
      "create": "Crear un token",
      "save": "Probar y guardar",
      "remove": "Quitar",
      "test": "Probar",
      "ok": "Conectado como @{{user}}",
      "removeQ": "¿Quitar esta cuenta? Los proyectos importados se quedan.",
      "keep": "Conservar"
    },
    "transport": {
      "extension": "Permitir el acceso a este servidor",
      "extensionHint": "Thunderbird pedirá permiso para contactarlo directamente.",
      "native": "Usar la red de este dispositivo",
      "nativeHint": "La app contacta con el servidor ella misma, sin límites del navegador.",
      "relay": "Usar el servidor de Productivist",
      "relayHint": "Tu token pasa por él, y no se guarda.",
      "denied": "No se concedió el permiso."
    },
    "synced": "Sincronizado {{time}}",
    "never": "Aún sin sincronizar",
    "connect": "Conecta {{name}} para actualizar",
    "openOn": "Abrir en {{name}}",
    "from": "Importado de {{ref}}",
    "hint": "Al actualizar, el título y la descripción pueden sustituirse por los de la incidencia."
  },
};
