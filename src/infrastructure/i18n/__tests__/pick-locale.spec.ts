import { describe, expect, it } from 'vitest'
import { pickLocale } from '@/infrastructure/i18n'

describe('pickLocale', () => {
  it.each([
    [['ru'], 'ru'],
    [['en'], 'en'],
    [['es'], 'es'],
  ])('picks %j as %s', (preferences, locale) => {
    expect(pickLocale(preferences)).toBe(locale)
  })

  it.each([
    [['es-MX'], 'es'],
    [['ru-RU'], 'ru'],
    [['en-GB'], 'en'],
    [['ES'], 'es'],
    [['Ru-ru'], 'ru'],
    [['zh-Hant-TW', 'es-419'], 'es'],
  ])('ignores region and case: %j is %s', (preferences, locale) => {
    expect(pickLocale(preferences)).toBe(locale)
  })

  it.each([
    [['es', 'ru'], 'es'],
    [['ru-RU', 'en-US', 'es'], 'ru'],
    [['en', 'ru'], 'en'],
  ])('takes the first supported in order: %j is %s', (preferences, locale) => {
    expect(pickLocale(preferences)).toBe(locale)
  })

  it.each([
    [['de-DE', 'ru'], 'ru'],
    [['fr', 'de', 'es-AR'], 'es'],
  ])('skips unsupported: %j is %s', (preferences, locale) => {
    expect(pickLocale(preferences)).toBe(locale)
  })

  it.each([[[]], [['de-DE']], [['fr', 'zh-CN', 'pt-BR']]])(
    'falls back to English for %j',
    (preferences) => {
      expect(pickLocale(preferences)).toBe('en')
    },
  )

  it.each([
    [[''], 'en'],
    [['-'], 'en'],
    [['x'], 'en'],
    [['-ru'], 'en'],
    [['russian'], 'en'],
    [['', '-', 'x', 'es'], 'es'],
  ])('is not confused by malformed tags: %j is %s', (preferences, locale) => {
    expect(pickLocale(preferences)).toBe(locale)
  })
})
