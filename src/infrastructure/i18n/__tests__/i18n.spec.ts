import { describe, expect, it } from 'vitest'
import type { Locale } from '@/domain/language'
import { createAppI18n } from '@/infrastructure/i18n'

// A non-breaking space keeps a unit (% in Russian and Spanish, seconds in every language) on the
// line of its number.
const NBSP = '\u00A0'

// Sample values from the texts table in docs/features/m1-session.md.
// The average time comes already formatted for the locale, so it is a string.
const params: Record<string, Record<string, number | string>> = {
  'session.questionOf': { number: 3, length: 10 },
  'session.question': { number: 3 },
  'session.correctOf': { correct: 2, checked: 3 },
  'session.streak': { count: 2 },
  'results.bestStreak': { count: 4 },
  'results.accuracy': { percent: 78, correct: 7, checked: 9 },
  'results.questions': { count: 9 },
  // Sample values from the texts table in docs/features/mistake-review.md. The place is a text
  // of its own, already translated, so a sample of it stands here.
  'trainer.review': { chosen: 're', expected: 'sol', place: '<place>' },
}

const averageTime: Record<Locale, string> = { en: '2.4', ru: '2,4', es: '2,4' }

const texts: Record<Locale, Record<string, string>> = {
  en: {
    'trainer.heading': 'Name the note',
    'trainer.staffLabel': 'Music staff',
    'trainer.staffLoadError': "Couldn't load the staff. Reload the page.",
    'trainer.check': 'Check',
    'trainer.next': 'Next',
    'trainer.correct': 'Correct',
    'trainer.incorrect': 'Incorrect',
    'trainer.chooseNoteNameFirst': 'Choose a note name first',
    'trainer.openNextAutomatically': 'Open next question automatically',
    'trainer.incorrectTryAgain': 'Incorrect. Try again.',
    'trainer.correctOnSecondTry': 'Correct on the second try',
    'trainer.review': 'You chose re. This is sol: the note <place>.',
    'trainer.place.ledgerLineBelow1': 'on the first ledger line below the staff',
    'trainer.place.belowStaff': 'just below the staff',
    'trainer.place.line1': 'on the 1st line',
    'trainer.place.line2': 'on the 2nd line',
    'trainer.place.line3': 'on the 3rd line',
    'trainer.place.space1': 'in the 1st space',
    'trainer.place.space2': 'in the 2nd space',
    'trainer.place.space3': 'in the 3rd space',
    'session.chooseLength': 'How many questions?',
    'session.unlimited': 'No limit',
    'session.showAnswerAtOnce': 'Show the right answer at once',
    'session.questionOf': 'Question 3 of 10',
    'session.question': 'Question 3',
    'session.toResults': 'Results',
    'session.finish': 'Finish',
    'session.correctOf': 'Correct: 2 of 3',
    'session.streak': 'Streak: 2',
    'results.heading': 'Results',
    'results.accuracy': 'Accuracy: 78% (7 of 9)',
    'results.questions': 'Questions: 9',
    'results.bestStreak': 'Best streak: 4',
    'results.averageTime': `Average time: 2.4${NBSP}s`,
    'results.newSession': 'New session',
    'preferences.language': 'Language',
    'preferences.noteNaming': 'Note names',
    'preferences.seventhNote': 'Seventh note',
  },
  ru: {
    'trainer.heading': 'Назовите ноту',
    'trainer.staffLabel': 'Нотоносец',
    'trainer.staffLoadError': 'Не удалось загрузить нотоносец. Перезагрузите страницу.',
    'trainer.check': 'Проверить',
    'trainer.next': 'Далее',
    'trainer.correct': 'Верно',
    'trainer.incorrect': 'Неверно',
    'trainer.chooseNoteNameFirst': 'Сначала выберите название ноты',
    'trainer.openNextAutomatically': 'Автоматически открывать следующий вопрос',
    'trainer.incorrectTryAgain': 'Неверно. Попробуйте ещё раз.',
    'trainer.correctOnSecondTry': 'Верно со второй попытки',
    'trainer.review': 'Вы выбрали re. Это sol — нота <place>.',
    'trainer.place.ledgerLineBelow1': 'на первой добавочной линейке снизу',
    'trainer.place.belowStaff': 'под нотоносцем',
    'trainer.place.line1': 'на первой линейке',
    'trainer.place.line2': 'на второй линейке',
    'trainer.place.line3': 'на третьей линейке',
    'trainer.place.space1': 'в первом промежутке',
    'trainer.place.space2': 'во втором промежутке',
    'trainer.place.space3': 'в третьем промежутке',
    'session.chooseLength': 'Сколько вопросов?',
    'session.unlimited': 'Без ограничения',
    'session.showAnswerAtOnce': 'Сразу показывать правильный ответ',
    'session.questionOf': 'Вопрос 3 из 10',
    'session.question': 'Вопрос 3',
    'session.toResults': 'Результаты',
    'session.finish': 'Завершить',
    'session.correctOf': 'Верно: 2 из 3',
    'session.streak': 'Серия: 2',
    'results.heading': 'Результаты',
    'results.accuracy': `Точность: 78${NBSP}% (7 из 9)`,
    'results.questions': 'Вопросов: 9',
    'results.bestStreak': 'Лучшая серия: 4',
    'results.averageTime': `Среднее время: 2,4${NBSP}с`,
    'results.newSession': 'Новая сессия',
    'preferences.language': 'Язык',
    'preferences.noteNaming': 'Названия нот',
    'preferences.seventhNote': 'Седьмая ступень',
  },
  es: {
    'trainer.heading': 'Nombra la nota',
    'trainer.staffLabel': 'Pentagrama',
    'trainer.staffLoadError': 'No se pudo cargar el pentagrama. Recarga la página.',
    'trainer.check': 'Comprobar',
    'trainer.next': 'Siguiente',
    'trainer.correct': 'Correcto',
    'trainer.incorrect': 'Incorrecto',
    'trainer.chooseNoteNameFirst': 'Primero elige el nombre de la nota',
    'trainer.openNextAutomatically': 'Abrir automáticamente la siguiente pregunta',
    'trainer.incorrectTryAgain': 'Incorrecto. Inténtalo de nuevo.',
    'trainer.correctOnSecondTry': 'Correcta en el segundo intento',
    'trainer.review': 'Elegiste re. Es sol: la nota <place>.',
    'trainer.place.ledgerLineBelow1': 'en la primera línea adicional inferior',
    'trainer.place.belowStaff': 'justo debajo del pentagrama',
    'trainer.place.line1': 'en la primera línea',
    'trainer.place.line2': 'en la segunda línea',
    'trainer.place.line3': 'en la tercera línea',
    'trainer.place.space1': 'en el primer espacio',
    'trainer.place.space2': 'en el segundo espacio',
    'trainer.place.space3': 'en el tercer espacio',
    'session.chooseLength': '¿Cuántas preguntas?',
    'session.unlimited': 'Sin límite',
    'session.showAnswerAtOnce': 'Mostrar la respuesta correcta de inmediato',
    'session.questionOf': 'Pregunta 3 de 10',
    'session.question': 'Pregunta 3',
    'session.toResults': 'Resultados',
    'session.finish': 'Terminar',
    'session.correctOf': 'Correctas: 2 de 3',
    'session.streak': 'Racha: 2',
    'results.heading': 'Resultados',
    'results.accuracy': `Precisión: 78${NBSP}% (7 de 9)`,
    'results.questions': 'Preguntas: 9',
    'results.bestStreak': 'Mejor racha: 4',
    'results.averageTime': `Tiempo medio: 2,4${NBSP}s`,
    'results.newSession': 'Nueva sesión',
    'preferences.language': 'Idioma',
    'preferences.noteNaming': 'Nombres de las notas',
    'preferences.seventhNote': 'Séptima nota',
  },
}

const locales = Object.keys(texts) as Locale[]

function flattenKeys(messages: object, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'object' && value !== null ? flattenKeys(value, path) : [path]
  })
}

function keysOf(locale: Locale): string[] {
  return flattenKeys(createAppI18n(locale).global.getLocaleMessage(locale)).sort()
}

describe('i18n', () => {
  describe.each(locales)('in %s', (locale) => {
    it.each(Object.entries(texts[locale]))('translates %s to "%s"', (key, text) => {
      const values = key === 'results.averageTime' ? { seconds: averageTime[locale] } : params[key]
      expect(createAppI18n(locale).global.t(key, values ?? {})).toBe(text)
    })

    it('uses the given locale', () => {
      expect(createAppI18n(locale).global.locale.value).toBe(locale)
    })

    it('has no texts beyond the checked ones', () => {
      expect(keysOf(locale)).toEqual(Object.keys(texts[locale]).sort())
    })
  })

  it.each(['ru', 'es'] as const)('has the same keys in %s as in English', (locale) => {
    expect(keysOf(locale)).toEqual(keysOf('en'))
  })
})
