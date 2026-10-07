import { describe, expect, it } from 'vitest'
import { createAppI18n } from '@/infrastructure/i18n'

type Locale = 'ru' | 'en' | 'es'

// Russian and Spanish put a non-breaking space before % so that it never wraps apart from the number.
const NBSP = '\u00A0'

// Sample values from the texts table in docs/features/m1-session.md.
const params: Record<string, Record<string, number>> = {
  'session.questionOf': { number: 3, length: 10 },
  'session.question': { number: 3 },
  'results.accuracy': { percent: 78, correct: 7, checked: 9 },
  'results.questions': { count: 9 },
}

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
    'session.chooseLength': 'How many questions?',
    'session.unlimited': 'No limit',
    'session.questionOf': 'Question 3 of 10',
    'session.question': 'Question 3',
    'session.toResults': 'Results',
    'results.heading': 'Results',
    'results.accuracy': 'Accuracy: 78% (7 of 9)',
    'results.questions': 'Questions: 9',
    'results.newSession': 'New session',
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
    'session.chooseLength': 'Сколько вопросов?',
    'session.unlimited': 'Без ограничения',
    'session.questionOf': 'Вопрос 3 из 10',
    'session.question': 'Вопрос 3',
    'session.toResults': 'Результаты',
    'results.heading': 'Результаты',
    'results.accuracy': `Точность: 78${NBSP}% (7 из 9)`,
    'results.questions': 'Вопросов: 9',
    'results.newSession': 'Новая сессия',
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
    'session.chooseLength': '¿Cuántas preguntas?',
    'session.unlimited': 'Sin límite',
    'session.questionOf': 'Pregunta 3 de 10',
    'session.question': 'Pregunta 3',
    'session.toResults': 'Resultados',
    'results.heading': 'Resultados',
    'results.accuracy': `Precisión: 78${NBSP}% (7 de 9)`,
    'results.questions': 'Preguntas: 9',
    'results.newSession': 'Nueva sesión',
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
      expect(createAppI18n(locale).global.t(key, params[key] ?? {})).toBe(text)
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
