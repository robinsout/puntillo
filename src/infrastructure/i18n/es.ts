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
  },
  session: {
    chooseLength: '¿Cuántas preguntas?',
    unlimited: 'Sin límite',
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
} satisfies Messages
