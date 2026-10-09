import type { Messages } from './en'

export default {
  trainer: {
    heading: 'Nombra la nota',
    staffLabel: 'Pentagrama',
    staffLoadError: 'No se pudo cargar el pentagrama. Recarga la página.',
    check: 'Comprobar',
    next: 'Siguiente',
    correct: 'Correcto',
    incorrect: 'Incorrecto',
    chooseNoteNameFirst: 'Primero elige el nombre de la nota',
    openNextAutomatically: 'Abrir automáticamente la siguiente pregunta',
    incorrectTryAgain: 'Incorrecto. Inténtalo de nuevo.',
    correctOnSecondTry: 'Correcta en el segundo intento',
    review: 'Elegiste {chosen}. Es {expected}: la nota {place}.',
    place: {
      ledgerLineBelow1: 'en la primera línea adicional inferior',
      belowStaff: 'justo debajo del pentagrama',
      line1: 'en la primera línea',
      line2: 'en la segunda línea',
      line3: 'en la tercera línea',
      space1: 'en el primer espacio',
      space2: 'en el segundo espacio',
      space3: 'en el tercer espacio',
    },
  },
  session: {
    chooseLength: '¿Cuántas preguntas?',
    unlimited: 'Sin límite',
    showAnswerAtOnce: 'Mostrar la respuesta correcta de inmediato',
    questionOf: 'Pregunta {number} de {length}',
    question: 'Pregunta {number}',
    toResults: 'Resultados',
    finish: 'Terminar',
    correctOf: 'Correctas: {correct} de {checked}',
    streak: 'Racha: {count}',
  },
  results: {
    heading: 'Resultados',
    // Non-breaking space so that % never wraps apart from the number.
    accuracy: 'Precisión: {percent}\u00A0% ({correct} de {checked})',
    questions: 'Preguntas: {count}',
    bestStreak: 'Mejor racha: {count}',
    averageTime: 'Tiempo medio: {seconds}\u00A0s',
    newSession: 'Nueva sesión',
  },
  preferences: {
    language: 'Idioma',
    noteNaming: 'Nombres de las notas',
    seventhNote: 'Séptima nota',
    notSaved: 'La configuración no se guardará en este navegador.',
  },
} satisfies Messages
