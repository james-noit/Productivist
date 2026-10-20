/**
 * Strings of Sportask's UI (Configuration > Sportask now; the break modal, setup sheet and panel later). They live here,
 * not in the locale files, because `en.json` is bundled eagerly and these are only used by lazy components:
 * `lib/sportask/texts.ts` merges them into ngx-translate under the `sportask` key the first time one of them opens.
 * Goal, program, exercise and equipment names are not here: they come from the catalog as `{ en, es }` pairs.
 * Only `config.sportask` (the Configuration nav entry) is in the locale files.
 */
export const SPORTASK_TEXTS: Record<'en' | 'es', Record<string, unknown>> = {
  en: {
    "intro": "Turn your Pomodoro breaks into short training blocks.",
    "disclaimer": "Sportask suggests general exercises; it is not medical advice and does not replace a professional. If you have an injury or a heart condition, are pregnant, or have not exercised in a while, check with your doctor first. Warm up, go at your own pace, and stop if you feel pain, dizziness or unusual shortness of breath. Calories are a rough estimate.",
    "goal": {
      "title": "Goal",
      "hint": "Pick what your breaks train for. If you change it, your history is kept.",
      "list": "Goals",
      "length": "{{weeks}} weeks, {{days}} days a week",
      "program": "Program",
      "level": "Your level",
      "levels": {
        "1": "Starting from zero",
        "2": "Some base",
        "3": "I train regularly"
      },
      "notice": "Before you start",
      "accept": "I have read this and accept it",
      "needAccept": "Accept the notice to start.",
      "start": "Start the program",
      "switch": "Switch to this program",
      "switchQ": "Switch program? Your history is kept.",
      "leave": "Leave the program",
      "leaveQ": "Leave the program? Your history is kept.",
      "keep": "Keep",
      "enrolled": "In the program since {{date}}."
    },
    "gear": {
      "title": "Equipment at home",
      "hint": "Exercises only use what you tick here. You can change it for a single session.",
      "weights": "Weights (kg)",
      "weightNew": "Add a weight in kg",
      "weightAdd": "Add",
      "weightRemove": "Remove {{kg}} kg",
      "bands": "Band strengths",
      "band": {
        "light": "Light",
        "medium": "Medium",
        "heavy": "Heavy"
      }
    },
    "limits": {
      "title": "Limits",
      "lowImpact": "No jumping (low impact)",
      "noFloor": "No floor work (office)"
    },
    "rhythm": {
      "title": "Default rhythm",
      "hint": "How long you focus and how long each break lasts. Every break with exercise becomes a training block.",
      "list": "Rhythms",
      "line": "{{focus}} min focus, {{brk}} min break",
      "long": "{{min}} min long break every {{n}} breaks",
      "every": "exercise every {{n}} breaks",
      "custom": "Custom",
      "focus": "Focus (min)",
      "break": "Break (min)",
      "longBreak": "Long break",
      "longEvery": "Long break every (breaks)",
      "longMin": "Long break (min)",
      "exEvery": "Exercise every (breaks)",
      "less": "Decrease",
      "more": "Increase"
    },
    "style": {
      "title": "Style",
      "list": "Skins",
      "dark": "Dark",
      "light": "Light",
      "wholeApp": "Apply to the whole app during a session",
      "cues": "Sound for each step",
      "autoStart": "Start the block without confirming"
    },
    "weight": {
      "title": "Body weight (optional, this device only)",
      "hint": "Only to estimate calories. It is not synced.",
      "unset": "Not set",
      "less": "Decrease weight",
      "more": "Increase weight",
      "unit": "kg"
    }
  },
  es: {
    "intro": "Convierte las pausas del Pomodoro en bloques de entrenamiento breves.",
    "disclaimer": "Sportask propone ejercicios generales; no es consejo médico ni sustituye a un profesional. Si tienes una lesión, una enfermedad cardiovascular, estás embarazada o hace tiempo que no haces ejercicio, consulta antes con tu médico. Calienta, respeta tu ritmo y para si notas dolor, mareo o falta de aire anormal. Las calorías son una estimación aproximada.",
    "goal": {
      "title": "Objetivo",
      "hint": "Elige para qué entrenan tus pausas. Si lo cambias, tu historial se conserva.",
      "list": "Objetivos",
      "length": "{{weeks}} semanas, {{days}} días por semana",
      "program": "Programa",
      "level": "Tu nivel",
      "levels": {
        "1": "Empiezo de cero",
        "2": "Algo de base",
        "3": "Entreno habitualmente"
      },
      "notice": "Antes de empezar",
      "accept": "He leído esto y lo acepto",
      "needAccept": "Acepta el aviso para empezar.",
      "start": "Empezar el programa",
      "switch": "Cambiar a este programa",
      "switchQ": "¿Cambiar de programa? Tu historial se conserva.",
      "leave": "Dejar el programa",
      "leaveQ": "¿Dejar el programa? Tu historial se conserva.",
      "keep": "Mantener",
      "enrolled": "En el programa desde el {{date}}."
    },
    "gear": {
      "title": "Material en casa",
      "hint": "Los ejercicios solo usan lo que marques aquí. Puedes cambiarlo para una sola sesión.",
      "weights": "Pesos (kg)",
      "weightNew": "Añadir un peso en kg",
      "weightAdd": "Añadir",
      "weightRemove": "Quitar {{kg}} kg",
      "bands": "Resistencia de las gomas",
      "band": {
        "light": "Suave",
        "medium": "Media",
        "heavy": "Fuerte"
      }
    },
    "limits": {
      "title": "Restricciones",
      "lowImpact": "Sin saltos (bajo impacto)",
      "noFloor": "Sin suelo (oficina)"
    },
    "rhythm": {
      "title": "Ritmo por defecto",
      "hint": "Cuánto te concentras y cuánto dura cada pausa. Cada pausa con ejercicio se convierte en un bloque de entrenamiento.",
      "list": "Ritmos",
      "line": "{{focus}} min de foco, {{brk}} min de pausa",
      "long": "pausa larga de {{min}} min cada {{n}} pausas",
      "every": "ejercicio cada {{n}} pausas",
      "custom": "Personalizado",
      "focus": "Foco (min)",
      "break": "Pausa (min)",
      "longBreak": "Pausa larga",
      "longEvery": "Pausa larga cada (pausas)",
      "longMin": "Pausa larga (min)",
      "exEvery": "Ejercicio cada (pausas)",
      "less": "Disminuir",
      "more": "Aumentar"
    },
    "style": {
      "title": "Estilo",
      "list": "Estilos",
      "dark": "Oscuro",
      "light": "Claro",
      "wholeApp": "Aplicar a toda la app durante la sesión",
      "cues": "Sonidos de cada paso",
      "autoStart": "Empezar el bloque sin confirmar"
    },
    "weight": {
      "title": "Peso corporal (opcional, solo en este dispositivo)",
      "hint": "Solo para estimar calorías. No se sincroniza.",
      "unset": "Sin indicar",
      "less": "Disminuir peso",
      "more": "Aumentar peso",
      "unit": "kg"
    }
  },
};
