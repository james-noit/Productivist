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
    "panel": {
      "week": "Week {{n}} of {{total}}",
      "testsThisWeek": "Tests this week",
      "nextTest": "Next test: {{date}}",
      "noGoal": "No goal yet. Free training works without one.",
      "pickGoal": "Choose a goal",
      "tabsLabel": "Sportask sections",
      "tab": {
        "summary": "Summary",
        "progress": "Progress",
        "history": "History",
        "templates": "Templates"
      },
      "empty": {
        "title": "Nothing here yet",
        "body": "Your training shows up here once you do a block. Open the Pomodoro, press the Sportask button, and exercise in your next break.",
        "progress": "Charts appear after your first block.",
        "history": "No blocks yet. Your first one, and its results, will be listed here."
      },
      "goPomodoro": "Go to the Pomodoro",
      "tile": {
        "title": "This week",
        "blocks": "Blocks",
        "minutes": "Active minutes",
        "streak": "Streak",
        "day": "1 day",
        "days": "{{n}} days",
        "kcal": "Calories (estimate)",
        "kcalHint": "Add your weight in Configuration"
      },
      "heat": "Last {{n}} weeks",
      "seeProgress": "See all progress",
      "range": "Period",
      "rangeWeeks": "{{n}} weeks",
      "rangeAll": "All",
      "pullHint": "To progress in pulling, add a band or a dumbbell in Configuration.",
      "tests": "Tests",
      "needWeight": "Calories need your body weight.",
      "addWeight": "Add it in Configuration",
      "noTests": "No test taken yet. The program offers them in its test weeks.",
      "noData": "Nothing recorded in this period.",
      "best": "Best",
      "sinceFirst": "since the first test",
      "less": "Less",
      "more": "More",
      "target": "Weekly target",
      "changedExercise": "The exercise used for this test changed: {{list}}. Compare with care.",
      "note": {
        "adherence": "Blocks per week: done, partly done and skipped.",
        "setsPerPattern": "Sets you marked done, by movement. The two sides of one exercise count as one set.",
        "zonesCovered": "A block counts once in every body zone it works.",
        "density": "Share of the time spent working rather than resting in your calories blocks.",
        "netKcal": "Estimate from the work you marked done: (MET - 1) x weight x hours. It is only approximate.",
        "ladderLevel": "The step of each movement you are on. It goes up after two good blocks."
      },
      "g": {
        "done": "Done",
        "partial": "Partly done",
        "skipped": "Skipped",
        "minutes": "Minutes",
        "kcal": "kcal",
        "blocks": "Blocks",
        "density": "Work density",
        "left": "Left",
        "right": "Right",
        "value": "Result",
        "squat": "Squat",
        "lunge": "Lunge",
        "hinge": "Hinge",
        "push": "Push",
        "pushVertical": "Overhead push",
        "pull": "Pull",
        "core": "Core",
        "cardio": "Cardio",
        "mobility": "Mobility",
        "neck": "Neck",
        "shoulders": "Shoulders",
        "thoracic": "Upper back",
        "spine": "Spine",
        "hips": "Hips",
        "hamstrings": "Hamstrings",
        "ankles": "Ankles",
        "wrists": "Wrists"
      },
      "unit": {
        "reps": "reps",
        "seconds": "s",
        "cm": "cm"
      },
      "kind": {
        "train": "Training",
        "warmup": "Warm-up",
        "test": "Test"
      },
      "status": {
        "done": "Done",
        "partial": "Partly done",
        "skipped": "Skipped"
      },
      "h": {
        "goal": "Goal training",
        "free": "Free training"
      },
      "records": "Personal records",
      "showAll": "Show {{n}} more",
      "showFewer": "Show fewer",
      "rowMenu": "Actions for the block at {{time}}",
      "editMarks": "Edit marks",
      "delete": "Delete",
      "deleteQ": "Delete this block? It disappears from the charts too.",
      "keep": "Keep",
      "moreDays": "Show earlier days ({{n}})",
      "close": "Close",
      "discardQ": "Discard your changes?",
      "keepEditing": "Keep editing",
      "cancel": "Cancel",
      "saveChanges": "Save changes",
      "tpl": {
        "intro": "Free training uses these. The built-in ones cannot be changed: duplicate one to make it yours.",
        "new": "New template",
        "mine": "My templates",
        "noneMine": "You have no templates yet. Make one, or duplicate a built-in one.",
        "builtin": "Built-in templates",
        "edit": "Edit",
        "duplicate": "Duplicate",
        "deleteQ": "Delete this template?",
        "copyName": "{{name}} (copy)",
        "count": "{{n}} exercises",
        "min": "from {{n}} min",
      "minSec": "from {{n}} s",
        "newTitle": "New template",
        "editTitle": "Edit template",
        "name": "Name",
        "format": "Format",
        "fmt": {
          "sequence": "Sequence",
          "intervals": "Intervals",
          "emom": "EMOM"
        },
        "fmtIntervals": "Intervals {{work}}/{{rest}}",
        "fmtHint": {
          "sequence": "Each exercise gets an equal share of the break; short blocks do it once, longer ones repeat the round.",
          "intervals": "Work and rest in turn, cycling through the exercises until the break is full.",
          "emom": "Every minute one exercise: do its reps, rest for what is left of the minute. Needs 2 minutes or more."
        },
        "work": "Work (s)",
        "rest": "Rest (s)",
        "slots": "Exercises",
        "noSlots": "Add at least one exercise.",
        "changeExercise": "Change exercise",
        "pattern": "Movement",
        "tag": "Kind",
        "zone": "Body zone",
        "any": "Any",
        "tags": {
          "mobility": "Mobility",
          "strength": "Strength",
          "calories": "Calories"
        },
        "slotMenu": "Actions for exercise {{n}}",
        "moveUp": "Move up",
        "moveDown": "Move down",
        "removeSlot": "Remove",
        "addExercise": "Add an exercise",
        "addPattern": "Add by movement",
        "reorderHint": "A slot by movement picks a different exercise each time. Alt + Up or Down moves the focused one.",
        "problem": {
          "name": "Give it a name.",
          "slots": "Add at least one exercise.",
          "exercise": "An exercise in the list no longer exists.",
          "work": "Work must be between 5 and 600 s.",
          "rest": "Rest must be at most 600 s."
        },
        "searchExercise": "Search exercises",
        "exercises": "Exercises",
        "noMatch": "No exercise matches.",
        "keepTyping": "{{n}} more: keep typing to narrow the list."
      }
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
    "panel": {
      "week": "Semana {{n}} de {{total}}",
      "testsThisWeek": "Tests esta semana",
      "nextTest": "Próximo test: {{date}}",
      "noGoal": "Aún sin objetivo. El entrenamiento libre funciona sin uno.",
      "pickGoal": "Elige un objetivo",
      "tabsLabel": "Secciones de Sportask",
      "tab": {
        "summary": "Resumen",
        "progress": "Progreso",
        "history": "Historial",
        "templates": "Plantillas"
      },
      "empty": {
        "title": "Aún no hay nada",
        "body": "Tu entrenamiento aparece aquí cuando hagas un bloque. Abre el Pomodoro, pulsa el botón Sportask y haz ejercicio en tu próxima pausa.",
        "progress": "Las gráficas aparecen tras tu primer bloque.",
        "history": "Todavía no hay bloques. El primero, con sus resultados, se listará aquí."
      },
      "goPomodoro": "Ir al Pomodoro",
      "tile": {
        "title": "Esta semana",
        "blocks": "Bloques",
        "minutes": "Minutos activos",
        "streak": "Racha",
        "day": "1 día",
        "days": "{{n}} días",
        "kcal": "Calorías (estimación)",
        "kcalHint": "Añade tu peso en Configuración"
      },
      "heat": "Últimas {{n}} semanas",
      "seeProgress": "Ver todo el progreso",
      "range": "Periodo",
      "rangeWeeks": "{{n}} semanas",
      "rangeAll": "Todo",
      "pullHint": "Para progresar en tirones, añade gomas o una mancuerna en Configuración.",
      "tests": "Tests",
      "needWeight": "Las calorías necesitan tu peso corporal.",
      "addWeight": "Añádelo en Configuración",
      "noTests": "Aún no has hecho ningún test. El programa los propone en sus semanas de test.",
      "noData": "Nada registrado en este periodo.",
      "best": "Mejor",
      "sinceFirst": "desde el primer test",
      "less": "Menos",
      "more": "Más",
      "target": "Objetivo semanal",
      "changedExercise": "El ejercicio de este test cambió: {{list}}. Compara con cuidado.",
      "note": {
        "adherence": "Bloques por semana: hechos, hechos a medias y saltados.",
        "setsPerPattern": "Series que marcaste como hechas, por movimiento. Los dos lados de un ejercicio cuentan como una serie.",
        "zonesCovered": "Un bloque cuenta una vez en cada zona del cuerpo que trabaja.",
        "density": "Parte del tiempo que pasas trabajando y no descansando en tus bloques de calorías.",
        "netKcal": "Estimación con el trabajo que marcaste: (MET - 1) x peso x horas. Es solo aproximada.",
        "ladderLevel": "El escalón de cada movimiento en el que estás. Sube tras dos bloques buenos."
      },
      "g": {
        "done": "Hechos",
        "partial": "A medias",
        "skipped": "Saltados",
        "minutes": "Minutos",
        "kcal": "kcal",
        "blocks": "Bloques",
        "density": "Densidad de trabajo",
        "left": "Izquierda",
        "right": "Derecha",
        "value": "Resultado",
        "squat": "Sentadilla",
        "lunge": "Zancada",
        "hinge": "Bisagra de cadera",
        "push": "Empuje",
        "pushVertical": "Empuje vertical",
        "pull": "Tirón",
        "core": "Core",
        "cardio": "Cardio",
        "mobility": "Movilidad",
        "neck": "Cuello",
        "shoulders": "Hombros",
        "thoracic": "Espalda alta",
        "spine": "Columna",
        "hips": "Caderas",
        "hamstrings": "Isquios",
        "ankles": "Tobillos",
        "wrists": "Muñecas"
      },
      "unit": {
        "reps": "rep.",
        "seconds": "s",
        "cm": "cm"
      },
      "kind": {
        "train": "Entreno",
        "warmup": "Calentamiento",
        "test": "Test"
      },
      "status": {
        "done": "Hecho",
        "partial": "A medias",
        "skipped": "Saltado"
      },
      "h": {
        "goal": "Entreno del objetivo",
        "free": "Entrenamiento libre"
      },
      "records": "Marcas personales",
      "showAll": "Ver {{n}} más",
      "showFewer": "Ver menos",
      "rowMenu": "Acciones del bloque de las {{time}}",
      "editMarks": "Editar marcas",
      "delete": "Eliminar",
      "deleteQ": "¿Eliminar este bloque? También desaparece de las gráficas.",
      "keep": "Conservar",
      "moreDays": "Ver días anteriores ({{n}})",
      "close": "Cerrar",
      "discardQ": "¿Descartar tus cambios?",
      "keepEditing": "Seguir editando",
      "cancel": "Cancelar",
      "saveChanges": "Guardar cambios",
      "tpl": {
        "intro": "El entrenamiento libre usa estas. Las incluidas no se pueden cambiar: duplica una para hacerla tuya.",
        "new": "Nueva plantilla",
        "mine": "Mis plantillas",
        "noneMine": "Aún no tienes plantillas. Crea una o duplica una de las incluidas.",
        "builtin": "Plantillas incluidas",
        "edit": "Editar",
        "duplicate": "Duplicar",
        "deleteQ": "¿Eliminar esta plantilla?",
        "copyName": "{{name}} (copia)",
        "count": "{{n}} ejercicios",
        "min": "desde {{n}} min",
      "minSec": "desde {{n}} s",
        "newTitle": "Nueva plantilla",
        "editTitle": "Editar plantilla",
        "name": "Nombre",
        "format": "Formato",
        "fmt": {
          "sequence": "Secuencia",
          "intervals": "Intervalos",
          "emom": "EMOM"
        },
        "fmtIntervals": "Intervalos {{work}}/{{rest}}",
        "fmtHint": {
          "sequence": "Cada ejercicio recibe una parte igual de la pausa; en bloques cortos se hace una vez y en los largos se repite la ronda.",
          "intervals": "Trabajo y descanso por turnos, recorriendo los ejercicios hasta llenar la pausa.",
          "emom": "Cada minuto un ejercicio: haz sus repeticiones y descansa lo que quede del minuto. Necesita 2 minutos o más."
        },
        "work": "Trabajo (s)",
        "rest": "Descanso (s)",
        "slots": "Ejercicios",
        "noSlots": "Añade al menos un ejercicio.",
        "changeExercise": "Cambiar ejercicio",
        "pattern": "Movimiento",
        "tag": "Tipo",
        "zone": "Zona del cuerpo",
        "any": "Cualquiera",
        "tags": {
          "mobility": "Movilidad",
          "strength": "Fuerza",
          "calories": "Calorías"
        },
        "slotMenu": "Acciones del ejercicio {{n}}",
        "moveUp": "Subir",
        "moveDown": "Bajar",
        "removeSlot": "Quitar",
        "addExercise": "Añadir un ejercicio",
        "addPattern": "Añadir por movimiento",
        "reorderHint": "Un hueco por movimiento elige un ejercicio distinto cada vez. Alt + Arriba o Abajo mueve el enfocado.",
        "problem": {
          "name": "Ponle un nombre.",
          "slots": "Añade al menos un ejercicio.",
          "exercise": "Un ejercicio de la lista ya no existe.",
          "work": "El trabajo debe estar entre 5 y 600 s.",
          "rest": "El descanso debe ser de 600 s como máximo."
        },
        "searchExercise": "Buscar ejercicios",
        "exercises": "Ejercicios",
        "noMatch": "Ningún ejercicio coincide.",
        "keepTyping": "{{n}} más: sigue escribiendo para acotar la lista."
      }
    },
    "weight": {
      "title": "Peso corporal (opcional, solo en este dispositivo)",
      "hint": "Solo para estimar calorías. No se sincroniza.",
      "unit": "kg"
    }
  },
};
