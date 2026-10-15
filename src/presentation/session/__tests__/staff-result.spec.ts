import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  constant,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  startingOnC4,
  startingOnC5,
  startSession,
  statusText,
} from '@/presentation/__tests__/screen'

// Feature design-system, slice 3, criterion 13 and edge case 2: once a question is checked, its
// result is on the staff. In Read notes every note of the question, the right answer, is marked
// right (data-marks of the stub); a note named or played on another step has a ghost there, the
// answer drawn in outline (data-ghosts, data-ghost-marks "wrong"), and the current note is no
// longer highlighted. In Write notes the written notes are marked right or wrong, and a note
// written on another step has the right note drawn in outline on its own step (data-ghost-marks
// "correct"). Under each note answered wrong its caption: the right name and on a second line what
// was answered, "fa — yours", in the colours of the tokens (checked in e2e); a note answered right
// has none. The captions are
// hidden from screen readers, which hear the review: the staff is described by the card of the
// result. Nothing of it is shown while the second attempt goes on, and all of it is gone on the
// next question.

afterEach(() => {
  cleanup()
  forgetDialogs()
  vi.restoreAllMocks()
})

// The notes are named in Latin syllables, the naming of a new user in every language.
const TEXTS = {
  en: {
    noLimit: 'No limit',
    check: 'Check',
    names: { do: 'do', mi: 'mi' },
    yours: (name: string) => `${name} — yours`,
  },
  ru: {
    noLimit: 'Без ограничения',
    check: 'Проверить',
    names: { do: 'do', mi: 'mi' },
    yours: (name: string) => `${name} — ваш ответ`,
  },
  es: {
    noLimit: 'Sin límite',
    check: 'Comprobar',
    names: { do: 'do', mi: 'mi' },
    yours: (name: string) => `${name} — tu respuesta`,
  },
} as const satisfies Record<Locale, unknown>

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const staff = () => screen.getByRole('img', { name: /^(Music staff|Нотоносец|Pentagrama)$/ })
const shown = (attribute: 'data-marks' | 'data-ghosts' | 'data-ghost-marks' | 'data-drawn') =>
  staff().getAttribute(attribute)
const exactText = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })

// Nothing marked: the props left out or every place empty.
const isUnmarked = () =>
  [shown('data-marks'), shown('data-ghosts')].every(
    (value) => value === null || value.split(' ').every((each) => each === '-'),
  )

// The lines of the captions under the notes, each a text of its own hidden from screen readers.
const captionLines = () =>
  [...document.querySelectorAll('[aria-hidden="true"], [aria-hidden="true"] *')]
    .filter((element) => !element.closest('svg') && element.children.length === 0)
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)

const describedBy = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id))

// The card of the result holds the status the screen reader hears.
function expectDescribedByResult() {
  const result = screen.getByRole('status')
  expect(describedBy(staff()).some((element) => element?.contains(result))).toBe(true)
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// Confident reading with one note in 4/4, no signs, the duration asked: C4 (do), a whole note,
// for startingOnC4; the right answer shown at once unless said otherwise.
const oneNote =
  ({ atOnce = true, quick = false, keyboard = false } = {}) =>
  (preferences: Preferences) => {
    preferences.choosePreset('confident-reading')
    preferences.customize({ questionLength: 'one-note' })
    preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
    preferences.customize({ keySignatures: 0 })
    preferences.customize({ accidentals: 'none' })
    if (atOnce) preferences.chooseShowAnswerAtOnce(true)
    if (quick) preferences.chooseAutoAdvance(true)
    if (keyboard) preferences.chooseNoteInput('keyboard')
  }

interface Reading {
  random?: Random
  locale?: Locale
  setUp?: (preferences: Preferences) => void
}

async function startReading({
  random = startingOnC4(),
  locale = 'en',
  setUp = oneNote(),
}: Reading = {}) {
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storageWith(setUp)),
  })
  await startSession(TEXTS[locale].noLimit)
}

async function answer(name: string, duration: string, check = 'Check') {
  await press(name)
  await press(duration)
  await press(check)
}

describe('the result of Read notes on the staff', () => {
  it('shows nothing before the check', async () => {
    await startReading()

    expect(isUnmarked()).toBe(true)
    expect(captionLines()).toEqual([])
    expect(staff().hasAttribute('aria-describedby')).toBe(false)
  })

  it('marks a note answered right as right, with no caption and no ghost', async () => {
    await startReading()

    await answer('do', '1/1')

    expect(shown('data-marks')).toBe('correct')
    expect(isUnmarked()).toBe(false)
    expect(shown('data-ghosts') ?? '-').toBe('-')
    expect(captionLines()).toEqual([])
  })

  it('marks the note of a wrong name right, the answer a ghost on its step, both names under it', async () => {
    await startReading()

    await answer('mi', '1/1')

    expect(shown('data-marks')).toBe('correct')
    expect(shown('data-ghosts')).toBe('E4')
    expect(shown('data-ghost-marks')).toBe('wrong')
    expect(captionLines()).toEqual(['do', 'mi — yours'])
  })

  it.each(['en', 'ru', 'es'] as const)('says the answer under the note in %s', async (locale) => {
    const texts = TEXTS[locale]
    await startReading({ locale })

    await answer(texts.names.mi, '1/1', texts.check)

    expect(captionLines()).toEqual([texts.names.do, texts.yours(texts.names.mi)])
  })

  it('puts a name on the step of its letter nearest to the note, below it if nearer', async () => {
    await startReading()

    await answer('sol', '1/1')

    expect(shown('data-ghosts')).toBe('G3')
  })

  it('puts a name on the nearest step across the octave', async () => {
    // C5, a quarter note.
    await startReading({ random: startingOnC5() })

    await answer('si', '1/4')

    expect(shown('data-ghosts')).toBe('B4')
  })

  it('captions a wrong duration alone without a ghost, said by its fraction', async () => {
    await startReading()

    await answer('do', '1/2')

    expect(shown('data-marks')).toBe('correct')
    expect(shown('data-ghosts') ?? '-').toBe('-')
    expect(captionLines()).toEqual(['do', '1/2 — yours'])
  })

  it('keeps the captions from screen readers and describes the staff by the result', async () => {
    await startReading()

    await answer('mi', '1/1')

    expect(screen.getByText('mi — yours').closest('[aria-hidden="true"]')).not.toBeNull()
    expect(staff().getAttribute('aria-label')).toBe('Music staff')
    expectDescribedByResult()
    expect(statusText()).toMatch(/You chose mi/)
  })

  it('describes the staff by the result of a right answer too', async () => {
    await startReading()

    await answer('do', '1/1')

    expectDescribedByResult()
    expect(statusText()).toBe('Correct')
  })

  it('shows nothing on the staff while the second attempt goes on', async () => {
    await startReading({ setUp: oneNote({ atOnce: false }) })

    await answer('mi', '1/1')

    expect(statusText()).toBe('Incorrect. Try again.')
    expect(isUnmarked()).toBe(true)
    expect(captionLines()).toEqual([])
  })

  it('shows the result of the second attempt', async () => {
    await startReading({ setUp: oneNote({ atOnce: false }) })
    await answer('mi', '1/1')

    await press('fa')
    await press('Check')

    expect(shown('data-marks')).toBe('correct')
    expect(shown('data-ghosts')).toBe('F4')
    expect(captionLines()).toEqual(['do', 'fa — yours'])
  })

  it('leaves a note put right on the second attempt without a caption', async () => {
    await startReading({ setUp: oneNote({ atOnce: false }) })
    await answer('mi', '1/1')

    await press('do')
    await press('Check')

    expect(shown('data-marks')).toBe('correct')
    expect(captionLines()).toEqual([])
  })

  it('clears the staff on the next question', async () => {
    await startReading()
    await answer('mi', '1/1')

    await press('Next')

    expect(isUnmarked()).toBe(true)
    expect(captionLines()).toEqual([])
    expect(staff().hasAttribute('aria-describedby')).toBe(false)
  })

  it('shows the result of a wrong answer in the quick mode, which stops on the review', async () => {
    await startReading({ setUp: oneNote({ quick: true }) })

    await press('1/1')
    await press('mi')

    expect(shown('data-marks')).toBe('correct')
    expect(shown('data-ghosts')).toBe('E4')
    expect(captionLines()).toEqual(['do', 'mi — yours'])
  })

  it('shows nothing on the new question after a right answer in the quick mode', async () => {
    await startReading({ setUp: oneNote({ quick: true }) })

    await press('1/1')
    await press('do')

    expect(statusText()).toBe('Correct')
    expect(isUnmarked()).toBe(true)
    expect(captionLines()).toEqual([])
  })
})

describe('the result of the piano keyboard on the staff', () => {
  const key = (name: string) =>
    within(screen.getByRole('group', { name: 'Piano keyboard' })).getByRole('button', { name })

  async function play(name: string) {
    await fireEvent.click(key(name))
    await press('1/1')
    await press('Check')
  }

  it('puts the key played on its own step, both names with their octaves', async () => {
    await startReading({ setUp: oneNote({ keyboard: true }) })

    await play('mi4')

    expect(shown('data-marks')).toBe('correct')
    expect(shown('data-ghosts')).toBe('E4')
    expect(captionLines()).toEqual(['do4', 'mi4 — yours'])
  })

  it('leaves the key of the note without a caption', async () => {
    await startReading({ setUp: oneNote({ keyboard: true }) })

    await play('do4')

    expect(shown('data-marks')).toBe('correct')
    expect(captionLines()).toEqual([])
  })

  it('names a black key by both of its names, with no ghost on the step of the note', async () => {
    await startReading({ setUp: oneNote({ keyboard: true }) })

    await play('do sharp 4 or re flat 4')

    expect(shown('data-marks')).toBe('correct')
    expect(shown('data-ghosts') ?? '-').toBe('-')
    expect(captionLines()).toEqual(['do4', 'do♯4/re♭4 — yours'])
  })
})

describe('the result of a question of several notes on the staff', () => {
  // Gives the values in turn, then the last one for ever.
  function inTurn(...values: number[]): Random {
    const queue = [...values]
    const last = values.at(-1) ?? 0
    return { next: () => queue.shift() ?? last }
  }

  // As in multi-note-trainer.spec.ts: C4 half (do 1/2), E4 quarter (mi 1/4), G4 quarter (sol 1/4).
  const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)

  const severalNotes =
    ({ atOnce = true } = {}) =>
    (preferences: Preferences) => {
      preferences.choosePreset('confident-reading')
      preferences.customize({ questionLength: 'two-to-four-notes' })
      preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
      if (atOnce) preferences.chooseShowAnswerAtOnce(true)
    }

  // Note 2 has a wrong name (fa for mi) and note 3 a wrong duration (1/2 for 1/4).
  async function triedWrong() {
    for (const name of ['do', '1/2', 'fa', '1/4', 'sol', '1/2']) await press(name)
    await press('Check')
  }

  it('marks each note right, a ghost for the wrong name alone, and captions the wrong notes', async () => {
    await startReading({ random: DO_MI_SOL(), setUp: severalNotes() })

    await triedWrong()

    expect(shown('data-marks')).toBe('correct correct correct')
    expect(shown('data-ghosts')).toBe('- F4 -')
    expect(shown('data-ghost-marks')).toBe('- wrong -')
    expect(captionLines()).toEqual(['mi', 'fa — yours', 'sol', '1/2 — yours'])
  })

  it('takes the highlight off the current note, the wrong notes still marked', async () => {
    await startReading({ random: DO_MI_SOL(), setUp: severalNotes() })
    const targets = () => screen.getAllByRole('button', { name: /^Note \d$/ })
    expect(targets().some((target) => target.getAttribute('aria-current') === 'true')).toBe(true)

    await triedWrong()

    expect(targets()).toHaveLength(3)
    expect(targets().filter((target) => target.getAttribute('aria-current') === 'true')).toEqual([])
  })

  it('puts the result in place of the answers written under the notes', async () => {
    await startReading({ random: DO_MI_SOL(), setUp: severalNotes() })

    await triedWrong()

    expect(exactText('fa 1/4')).toBeNull()
    expect(exactText('sol 1/2')).toBeNull()
  })

  it('shows the result of the second attempt, the notes right on the first one right', async () => {
    await startReading({ random: DO_MI_SOL(), setUp: severalNotes({ atOnce: false }) })
    await triedWrong()
    expect(isUnmarked()).toBe(true)

    await press('re')
    await press('1/8')
    await press('Check')

    expect(shown('data-marks')).toBe('correct correct correct')
    expect(shown('data-ghosts')).toBe('- D4 -')
    expect(captionLines()).toEqual(['mi', 're — yours', 'sol', '1/8 — yours'])
  })

  it('clears the staff on the next question', async () => {
    await startReading({ random: DO_MI_SOL(), setUp: severalNotes() })
    await triedWrong()

    await press('Next')

    expect(isUnmarked()).toBe(true)
    expect(captionLines()).toEqual([])
  })
})

describe('the result of Write notes on the staff', () => {
  // jsdom lays nothing out, so every element is a box 360 wide and 100 high at the top of the
  // page. The staff of the stub spans the whole box: its lines run from y = 30 down to y = 70.
  beforeEach(() => {
    const box = { x: 0, y: 0, top: 0, left: 0, width: 360, height: 100, right: 360, bottom: 100 }
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      ...box,
      toJSON: () => box,
    } as DOMRect)
  })

  const AT = { F4: 65, G4: 60 } as const

  const WRITING = {
    en: { exercise: 'Exercise', write: 'Write notes', sol: 'sol4', fa: 'fa4' },
    ru: { exercise: 'Упражнение', write: 'Записывать ноты', sol: 'sol4', fa: 'fa4' },
    es: { exercise: 'Ejercicio', write: 'Escribir notas', sol: 'sol4', fa: 'fa4' },
  } as const satisfies Record<Locale, unknown>

  // First steps, the duration not asked: G4 (sol4), then F4, G4… The right answer shown at once.
  async function startWriting({ locale = 'en' as Locale, names = false } = {}) {
    const texts = WRITING[locale]
    const storage = storageWith((preferences) => {
      preferences.chooseShowAnswerAtOnce(true)
      if (names) preferences.chooseShowNoteNames(true)
    })
    renderSessionWith({
      random: constant(0.45),
      clock: createManualClock().clock,
      preferences: preferencesFor([locale], storage),
    })
    const group =
      screen.queryByRole('group', { name: texts.exercise }) ??
      screen.getByRole('radiogroup', { name: texts.exercise })
    await fireEvent.click(within(group).getByRole('radio', { name: texts.write }))
    await startSession(TEXTS[locale].noLimit)
  }

  async function write(y: number, check = 'Check') {
    await fireEvent.click(screen.getByRole('slider'), { clientX: 180, clientY: y })
    await press(check)
  }

  it('shows nothing before the check', async () => {
    await startWriting()

    await fireEvent.click(screen.getByRole('slider'), { clientX: 180, clientY: AT.F4 })

    expect(isUnmarked()).toBe(true)
    expect(staff().hasAttribute('aria-describedby')).toBe(false)
  })

  it('marks a note written right, with no caption', async () => {
    await startWriting()

    await write(AT.G4)

    expect(shown('data-marks')).toBe('correct')
    expect(shown('data-ghosts') ?? '-').toBe('-')
    expect(captionLines()).toEqual([])
  })

  it('marks a note written on a wrong step, the right note drawn in outline on its own', async () => {
    await startWriting()

    await write(AT.F4)

    expect(shown('data-drawn')).toBe('F4')
    expect(shown('data-marks')).toBe('wrong')
    expect(shown('data-ghosts')).toBe('G4')
    expect(shown('data-ghost-marks')).toBe('correct')
    expect(captionLines()).toEqual(['sol4', 'fa4 — yours'])
  })

  it.each(['en', 'ru', 'es'] as const)('says the note written under it in %s', async (locale) => {
    const texts = WRITING[locale]
    await startWriting({ locale })

    await write(AT.F4, TEXTS[locale].check)

    expect(captionLines()).toEqual([texts.sol, TEXTS[locale].yours(texts.fa)])
  })

  it('puts the result in place of the name of the written note', async () => {
    await startWriting({ names: true })
    await fireEvent.click(screen.getByRole('slider'), { clientX: 180, clientY: AT.F4 })
    expect(captionLines()).toEqual(['fa4'])

    await press('Check')

    expect(captionLines()).toEqual(['sol4', 'fa4 — yours'])
  })

  it('takes the highlight off the current column', async () => {
    await startWriting()
    await fireEvent.click(screen.getByRole('slider'), { clientX: 180, clientY: AT.F4 })
    expect(screen.getByRole('slider').getAttribute('aria-current')).toBe('true')

    await press('Check')

    expect(screen.getAllByRole('slider')).toHaveLength(1)
    expect(screen.getByRole('slider').getAttribute('aria-current')).not.toBe('true')
  })

  it('describes the staff by the result', async () => {
    await startWriting()

    await write(AT.F4)

    expectDescribedByResult()
  })

  it('clears the staff on the next question', async () => {
    await startWriting()
    await write(AT.F4)

    await press('Next')

    expect(isUnmarked()).toBe(true)
    expect(captionLines()).toEqual([])
    expect(staff().hasAttribute('aria-describedby')).toBe(false)
  })
})
