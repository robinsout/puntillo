import { describe, expect, it } from 'vitest'
import { createAppI18n } from '@/infrastructure/i18n'

type Locale = 'ru' | 'en' | 'es'

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
      expect(createAppI18n(locale).global.t(key)).toBe(text)
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
