import { describe, expect, it } from 'vitest'
import { createAppI18n } from '@/infrastructure/i18n'

describe('i18n', () => {
  it.each([
    ['trainer.check', 'Check'],
    ['trainer.next', 'Next'],
    ['trainer.correct', 'Correct'],
    ['trainer.incorrect', 'Incorrect'],
    ['trainer.chooseNoteNameFirst', 'Choose a note name first'],
    ['trainer.heading', 'Name the note'],
    ['trainer.staffLabel', 'Music staff'],
    ['trainer.staffLoadError', "Couldn't load the staff. Reload the page."],
  ])('translates %s to "%s" in English', (key, text) => {
    expect(createAppI18n().global.t(key)).toBe(text)
  })
})
