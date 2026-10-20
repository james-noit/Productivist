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
    "btn": {
      "goal": "My goal: {{name}}",
      "free": "Free training",
      "rhythm": "Rhythm {{rhythm}} (focus/break, minutes)",
      "change": "Change...",
      "leave": "Leave Sportask"
    },
    "setup": {
      "title": "Sportask",
      "what": "What to train",
      "goalTab": "My goal",
      "freeTab": "Free training",
      "noGoal": "You have not picked a goal yet.",
      "pickGoal": "Choose a goal",
      "week": "Week {{week}} of {{weeks}}",
      "templates": "Templates",
      "random": "Random",
      "needsGear": "Needs equipment you do not have",
      "gear": "Equipment today",
      "noGear": "No equipment",
      "gearHint": "Only for this session.",
      "shortBreak": "Only a short exercise fits in a break this short.",
      "cancel": "Cancel",
      "activate": "Turn on Sportask",
      "activateAccept": "I accept and turn it on",
      "savePlan": "Save for the plan",
      "savePlanAccept": "I accept and save"
    },
    "brk": {
      "menu": "More options",
      "leave": "Leave Sportask",
      "pain": "If something hurts, stop.",
      "head": {
        "freeAny": "Free training",
        "free": "Free training · {{name}}",
        "test": "Test: {{name}}",
        "rest": "Rest day: {{goal}}",
        "goal": "{{goal}} · week {{week}}",
        "warmup": "Warm-up · {{goal}} · week {{week}}"
      },
      "restDay": "Rest day: this block is easy so you recover. Train anyway if you feel like it.",
      "trainAnyway": "Train anyway",
      "fallback": {
        "mobility": "With these limits the usual exercises do not fit, so this block is mobility.",
        "minimal": "With these limits only one easy move fits."
      },
      "steps": "Steps in this block",
      "side": {
        "left": "Left",
        "right": "Right"
      },
      "round": "Round {{n}}",
      "unit": {
        "reps": "{{n}} reps",
        "seconds": "{{n}} s",
        "max": "as many as you can",
        "kg": "{{n}} kg"
      },
      "total": "{{time}} in total",
      "start": "Start",
      "another": "Another one",
      "skip": "Skip",
      "phase": {
        "prep": "Get ready",
        "work": "Go",
        "rest": "Rest",
        "breathe": "Breathe / walk"
      },
      "next": "Next: {{name}}",
      "left": "Break left: {{time}}",
      "pause": "Pause",
      "resume": "Resume",
      "markDone": "Done",
      "finishNow": "Finish now",
      "say": {
        "prep": "Get ready: {{name}} {{dose}}",
        "work": "Now: {{name}}, {{dose}}",
        "rest": "Rest. Next: {{name}}, {{dose}}",
        "breathe": "Breathe and walk until the break ends"
      },
      "marks": "How did it go? Check what you did.",
      "testResult": "Enter your result.",
      "field": {
        "reps": "Reps",
        "seconds": "Seconds",
        "cm": "cm",
        "kg": "Weight (kg)"
      },
      "feel": "How did it feel?",
      "feedback": {
        "tooEasy": "Easy",
        "ok": "Good",
        "tooHard": "Hard"
      },
      "rpe": "Effort, 1 to 10 (optional)",
      "saveBack": "Save and back to work",
      "save": "Save",
      "discard": "Discard",
      "discardQ": "Discard the marks?"
    },
    "weight": {
      "title": "Body weight (optional, this device only)",
      "hint": "Only to estimate calories. It is not synced.",
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
    "btn": {
      "goal": "Mi objetivo: {{name}}",
      "free": "Entrenamiento libre",
      "rhythm": "Ritmo {{rhythm}} (foco/pausa, minutos)",
      "change": "Cambiar...",
      "leave": "Salir de Sportask"
    },
    "setup": {
      "title": "Sportask",
      "what": "Qué entrenar",
      "goalTab": "Mi objetivo",
      "freeTab": "Entrenamiento libre",
      "noGoal": "Todavía no has elegido un objetivo.",
      "pickGoal": "Elegir un objetivo",
      "week": "Semana {{week}} de {{weeks}}",
      "templates": "Plantillas",
      "random": "Al azar",
      "needsGear": "Necesita material que no tienes",
      "gear": "Material de hoy",
      "noGear": "Sin material",
      "gearHint": "Solo para esta sesión.",
      "shortBreak": "En una pausa tan corta solo cabe un ejercicio breve.",
      "cancel": "Cancelar",
      "activate": "Activar Sportask",
      "activateAccept": "Acepto y lo activo",
      "savePlan": "Guardar para el plan",
      "savePlanAccept": "Acepto y guardo"
    },
    "brk": {
      "menu": "Más opciones",
      "leave": "Salir de Sportask",
      "pain": "Si algo duele, para.",
      "head": {
        "freeAny": "Entrenamiento libre",
        "free": "Entrenamiento libre · {{name}}",
        "test": "Test: {{name}}",
        "rest": "Día de descanso: {{goal}}",
        "goal": "{{goal}} · semana {{week}}",
        "warmup": "Calentamiento · {{goal}} · semana {{week}}"
      },
      "restDay": "Día de descanso: este bloque es suave para que te recuperes. Entrena igualmente si te apetece.",
      "trainAnyway": "Entrenar igualmente",
      "fallback": {
        "mobility": "Con estas restricciones no caben los ejercicios habituales, así que este bloque es de movilidad.",
        "minimal": "Con estas restricciones solo cabe un movimiento suave."
      },
      "steps": "Pasos de este bloque",
      "side": {
        "left": "Izquierda",
        "right": "Derecha"
      },
      "round": "Ronda {{n}}",
      "unit": {
        "reps": "{{n}} reps",
        "seconds": "{{n}} s",
        "max": "las que puedas",
        "kg": "{{n}} kg"
      },
      "total": "{{time}} en total",
      "start": "Empezar",
      "another": "Otro",
      "skip": "Saltar",
      "phase": {
        "prep": "Prepárate",
        "work": "¡Vamos!",
        "rest": "Descanso",
        "breathe": "Respira / camina"
      },
      "next": "Siguiente: {{name}}",
      "left": "Pausa restante: {{time}}",
      "pause": "Pausa",
      "resume": "Reanudar",
      "markDone": "Hecho",
      "finishNow": "Terminar ya",
      "say": {
        "prep": "Prepárate: {{name}} {{dose}}",
        "work": "Ahora: {{name}}, {{dose}}",
        "rest": "Descanso. Siguiente: {{name}}, {{dose}}",
        "breathe": "Respira y camina hasta que acabe la pausa"
      },
      "marks": "¿Qué tal ha ido? Marca lo que has hecho.",
      "testResult": "Anota tu resultado.",
      "field": {
        "reps": "Repeticiones",
        "seconds": "Segundos",
        "cm": "cm",
        "kg": "Peso (kg)"
      },
      "feel": "¿Cómo se ha sentido?",
      "feedback": {
        "tooEasy": "Fácil",
        "ok": "Bien",
        "tooHard": "Duro"
      },
      "rpe": "Esfuerzo, de 1 a 10 (opcional)",
      "saveBack": "Guardar y volver al trabajo",
      "save": "Guardar",
      "discard": "Descartar",
      "discardQ": "¿Descartar las marcas?"
    },
    "weight": {
      "title": "Peso corporal (opcional, solo en este dispositivo)",
      "hint": "Solo para estimar calorías. No se sincroniza.",
      "unit": "kg"
    }
  },
};
