import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import type { Locale } from '@/domain/language'
import {
  chooseLength,
  chooseShownDuration,
  constant,
  createManualClock,
  createMemoryStorage,
  DURATION_NAMES,
  DURATIONS,
  loadSession,
  NAMES,
  preferencesFor,
  renderSession,
  renderSessionWith,
  statusText,
  storageWithPreset,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature difficulty-presets, slice 1: the cards First steps and Confident reading, criteria 1–5
// and 7 up to G5, the chosen preset kept (criterion 14), edge case 1. Advanced, of slice 2, is in
// advanced-preset.spec.ts, apart from its card among the others.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const FIRST_STEPS = 'First steps'
const CONFIDENT_READING = 'Confident reading'
const ADVANCED = 'Advanced'
const PRESETS = [FIRST_STEPS, CONFIDENT_READING, ADVANCED]

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const status = statusText
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const shownPitch = () => staff().getAttribute('data-pitch')
const shownDuration = () => staff().getAttribute('data-duration')
const exactText = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })

const isPressed = (name: string) => button(name).getAttribute('aria-pressed') === 'true'
const pressedPresets = (names: readonly string[] = PRESETS) => names.filter(isPressed)

const anyDurationButton = () =>
  Object.values<string>(DURATION_NAMES).filter((name) => queryButton(name) !== null)

// A damaged storage holds garbage under every key.
const storageHolding = (value: string): KeyValueStorage => ({
  get: () => value,
  set: () => {},
  canSave: () => true,
})

function reload(storage: KeyValueStorage, browserLanguages: readonly string[] = ['en']) {
  cleanup()
  loadSession(storage, browserLanguages)
}

// A new user: nothing saved, so First steps. Its notes are the seven D4–C5 and are half or quarter
// notes: a constant 0 alternates half notes D4 (re), E4 (mi), D4…
function renderNewUser(random: Random = constant(0), locale: Locale = 'en') {
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], createMemoryStorage()),
  })
}

async function startFirstSteps(random: Random = constant(0)) {
  renderNewUser(random)
  await chooseLength('No limit')
}

async function answerName(name: string) {
  await fireEvent.click(button(name))
  await fireEvent.click(button('Check'))
}

describe('the preset cards', () => {
  it('are three buttons above Customize and the lengths: First steps, Confident reading, Advanced', () => {
    renderNewUser()

    const names = screen.getAllByRole('button').map((element) => element.textContent?.trim())
    expect(names.slice(0, 5)).toEqual([FIRST_STEPS, CONFIDENT_READING, ADVANCED, 'Customize', '10'])
  })

  it('have First steps chosen for a new user, and only it', () => {
    renderNewUser()

    expect(pressedPresets()).toEqual([FIRST_STEPS])
  })

  it('mark the card pressed as the only chosen one', async () => {
    renderNewUser()

    await fireEvent.click(button(CONFIDENT_READING))

    expect(pressedPresets()).toEqual([CONFIDENT_READING])
  })

  it('can go back to First steps', async () => {
    renderNewUser()
    await fireEvent.click(button(CONFIDENT_READING))

    await fireEvent.click(button(FIRST_STEPS))

    expect(pressedPresets()).toEqual([FIRST_STEPS])
  })

  it('keep the chosen card chosen when it is pressed again', async () => {
    renderNewUser()

    await fireEvent.click(button(FIRST_STEPS))

    expect(pressedPresets()).toEqual([FIRST_STEPS])
  })

  it('keep the choice for the next session of the same page', async () => {
    renderNewUser()
    await fireEvent.click(button(CONFIDENT_READING))
    await chooseLength('No limit')

    await fireEvent.click(button('Finish'))

    expect(pressedPresets()).toEqual([CONFIDENT_READING])
  })

  it.each<[Locale, string[]]>([
    ['ru', ['Первые шаги', 'Уверенное чтение', 'Продвинутый']],
    ['es', ['Primeros pasos', 'Lectura segura', 'Avanzado']],
  ])('are named in %s', (locale, names) => {
    renderNewUser(constant(0), locale)

    expect(pressedPresets(names)).toEqual([names[0]])
  })

  it('are not on the question screen', async () => {
    await startFirstSteps()

    expect(queryButton(FIRST_STEPS)).toBeNull()
    expect(queryButton(CONFIDENT_READING)).toBeNull()
    expect(queryButton(ADVANCED)).toBeNull()
  })
})

// Criterion 14 and edge case 1.
describe('the chosen preset after a reload', () => {
  it('is kept', async () => {
    const storage = createMemoryStorage()
    loadSession(storage)
    await fireEvent.click(button(CONFIDENT_READING))

    reload(storage)

    expect(pressedPresets()).toEqual([CONFIDENT_READING])
  })

  it('is kept when First steps is chosen back', async () => {
    const storage = storageWithPreset('confident-reading')
    loadSession(storage)
    await fireEvent.click(button(FIRST_STEPS))

    reload(storage)

    expect(pressedPresets()).toEqual([FIRST_STEPS])
  })

  it('is kept under its name in another language', async () => {
    const storage = createMemoryStorage()
    loadSession(storage, ['en'])
    await fireEvent.click(button(CONFIDENT_READING))

    reload(storage, ['es'])

    expect(pressedPresets(['Primeros pasos', 'Lectura segura'])).toEqual(['Lectura segura'])
  })

  it.each(['', 'Confident reading', 'confidentReading', '"confident-reading"', 'Advanced', 'x'])(
    'is First steps, without a word, when the saved value is damaged: %j',
    async (value) => {
      loadSession(storageHolding(value))

      expect(pressedPresets()).toEqual([FIRST_STEPS])
      expect(screen.queryByRole('alert')).toBeNull()
      await chooseLength('No limit')
      expect(anyDurationButton()).toEqual([])
    },
  )

  it('is First steps again after a reload with an unavailable storage', async () => {
    const storage = unavailableStorage()
    loadSession(storage)
    await fireEvent.click(button(CONFIDENT_READING))

    reload(storage)

    expect(pressedPresets()).toEqual([FIRST_STEPS])
  })
})

// Criterion 2: the next session goes with the parameters of the chosen preset.
describe('a session after choosing a preset', () => {
  it('asks for the duration in Confident reading, starting on a whole C4', async () => {
    renderNewUser()
    await fireEvent.click(button(CONFIDENT_READING))

    await chooseLength('No limit')

    expect(DURATIONS.map((name) => queryButton(name) !== null)).toEqual([true, true, true, true])
    expect(shownPitch()).toBe('C4')
    expect(shownDuration()).toBe('whole')
  })

  it('does not ask for the duration in First steps, starting on D4', async () => {
    renderNewUser()
    await fireEvent.click(button(CONFIDENT_READING))
    await fireEvent.click(button(FIRST_STEPS))

    await chooseLength('No limit')

    expect(anyDurationButton()).toEqual([])
    expect(shownPitch()).toBe('D4')
  })

  it('takes a preset chosen between sessions for the next one', async () => {
    await startFirstSteps()
    await fireEvent.click(button('Finish'))
    await fireEvent.click(button(CONFIDENT_READING))

    await chooseLength('No limit')

    expect(queryButton(DURATION_NAMES.whole)).not.toBeNull()
    expect(shownPitch()).toBe('C4')
  })
})

// Criteria 3 and 4: First steps is D4–C5, as C4 needs a ledger line, in half and quarter notes.
describe('the notes of First steps', () => {
  it.each<[number, string, string]>([
    [0, 'D4', 'half'],
    [0.49, 'G4', 'half'],
    [0.5, 'G4', 'quarter'],
    [0.99, 'C5', 'quarter'],
  ])('are picked by the source: %f gives a %s %s note', async (value, pitch, duration) => {
    await startFirstSteps(constant(value))

    expect(shownPitch()).toBe(pitch)
    expect(shownDuration()).toBe(duration)
  })

  it('never include C4', async () => {
    for (let index = 0; index < 14; index++) {
      await startFirstSteps(constant(index / 14))
      expect(shownPitch()).not.toBe('C4')
      cleanup()
    }
  })
})

// Criterion 5: no row of durations, the name alone is checked, a note is worth one point.
describe('a session in First steps', () => {
  it('shows the seven note names and no duration button', async () => {
    await startFirstSteps()

    for (const name of NAMES) expect(queryButton(name)).not.toBeNull()
    expect(anyDurationButton()).toEqual([])
  })

  it('takes the right name alone as correct, for one point', async () => {
    await startFirstSteps()

    await answerName('re')

    expect(status()).toBe('Correct')
    expect(exactText('Points: 1 of 1')).not.toBeNull()
    expect(exactText('Streak: 1')).not.toBeNull()
  })

  it('asks for the name on Check without one', async () => {
    await startFirstSteps()

    await fireEvent.click(button('Check'))

    expect(status()).toBe('Choose a note name first')
    expect(exactText('Points: 0 of 0')).not.toBeNull()
  })

  it('still asks for the name and the duration in Confident reading', async () => {
    renderSession()
    await chooseLength('No limit')

    await fireEvent.click(button('Check'))

    expect(status()).toBe('Choose a note name and a duration')
  })

  it('gives a second attempt on a wrong name, with no point', async () => {
    await startFirstSteps()

    await answerName('mi')

    expect(status()).toBe('Incorrect. Try again.')
    expect(exactText('Points: 0 of 1')).not.toBeNull()
  })

  it('says "Correct on the second try" for the right name then', async () => {
    await startFirstSteps()
    await answerName('mi')

    await answerName('re')

    expect(status()).toBe('Correct on the second try')
    expect(exactText('Points: 0 of 1')).not.toBeNull()
  })

  it('explains the name alone after a second wrong name', async () => {
    await startFirstSteps()
    await answerName('mi')

    await answerName('fa')

    expect(status()).toBe('You chose fa. This is re: the note just below the staff.')
    expect(queryButton('Next')).not.toBeNull()
  })

  it('explains the name alone at once with the box "Show the right answer at once"', async () => {
    renderNewUser()
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Show the right answer at once' }))
    await chooseLength('No limit')

    await answerName('sol')

    expect(status()).toBe('You chose sol. This is re: the note just below the staff.')
  })

  it('counts 3 of 4 points over four notes and gives "Accuracy: 75% (3 of 4 points)"', async () => {
    await startFirstSteps()
    // D4, E4, D4, E4 in turn: the second one is missed twice.
    await answerName('re')
    await fireEvent.click(button('Next'))
    await answerName('fa')
    await answerName('sol')
    await fireEvent.click(button('Next'))
    await answerName('re')
    await fireEvent.click(button('Next'))
    await answerName('mi')
    expect(exactText('Points: 3 of 4')).not.toBeNull()

    await fireEvent.click(button('Finish'))

    expect(exactText('Accuracy: 75% (3 of 4 points)')).not.toBeNull()
    expect(exactText('Questions: 4')).not.toBeNull()
  })

  describe('in the quick mode', () => {
    async function startQuick() {
      await startFirstSteps()
      await fireEvent.click(
        screen.getByRole('checkbox', { name: 'Open next question automatically' }),
      )
    }

    it('answers with a press of the name and opens the next note', async () => {
      await startQuick()

      await fireEvent.click(button('re'))

      expect(shownPitch()).toBe('E4')
      expect(status()).toBe('Correct')
      expect(exactText('Points: 1 of 1')).not.toBeNull()
      expect(queryButton('Check')).toBeNull()
    })

    it('stays on the note after a wrong name for the second attempt', async () => {
      await startQuick()

      await fireEvent.click(button('mi'))

      expect(shownPitch()).toBe('D4')
      expect(status()).toBe('Incorrect. Try again.')
    })

    it('opens the next note on the right name in the second attempt', async () => {
      await startQuick()
      await fireEvent.click(button('mi'))

      await fireEvent.click(button('re'))

      expect(shownPitch()).toBe('E4')
      expect(status()).toBe('Correct on the second try')
    })

    it('explains the name alone after a second wrong name and waits for Next', async () => {
      await startQuick()
      await fireEvent.click(button('mi'))

      await fireEvent.click(button('fa'))

      expect(status()).toBe('You chose fa. This is re: the note just below the staff.')
      expect(shownPitch()).toBe('D4')
      expect(queryButton('Next')).not.toBeNull()
    })
  })
})

// Criterion 7 up to G5; the English texts are checked in mistake-review.spec.ts.
describe('the review of a note above the 3rd space', () => {
  describe.each([
    {
      locale: 'ru' as const,
      staff: 'Нотоносец',
      atOnce: 'Сразу показывать правильный ответ',
      noLimit: 'Без ограничения',
      check: 'Проверить',
      review: (expected: string, place: string) =>
        `Вы выбрали do. Это ${expected} — нота ${place}.`,
      places: {
        D5: 'на четвёртой линейке',
        E5: 'в четвёртом промежутке',
        F5: 'на пятой линейке',
        G5: 'над нотоносцем',
      },
    },
    {
      locale: 'es' as const,
      staff: 'Pentagrama',
      atOnce: 'Mostrar la respuesta correcta de inmediato',
      noLimit: 'Sin límite',
      check: 'Comprobar',
      review: (expected: string, place: string) => `Elegiste do. Es ${expected}: la nota ${place}.`,
      places: {
        D5: 'en la cuarta línea',
        E5: 'en el cuarto espacio',
        F5: 'en la quinta línea',
        G5: 'justo encima del pentagrama',
      },
    },
  ])('in the $locale language', (texts) => {
    // Confident reading: the first note is the k-th of the twelve C4–G5 for a constant k/12.
    it.each([
      { index: 8, pitch: 'D5', right: 're' },
      { index: 9, pitch: 'E5', right: 'mi' },
      { index: 10, pitch: 'F5', right: 'fa' },
      { index: 11, pitch: 'G5', right: 'sol' },
    ] as const)('names the place of $pitch', async (note) => {
      renderSession(constant(note.index / 12), createManualClock(), texts.locale)
      await fireEvent.click(screen.getByRole('checkbox', { name: texts.atOnce }))
      await chooseLength(texts.noLimit)
      const shown = screen.getByRole('img', { name: texts.staff }).getAttribute('data-pitch')
      expect(shown).toBe(note.pitch)

      await fireEvent.click(button('do'))
      await chooseShownDuration()
      await fireEvent.click(button(texts.check))

      expect(status()).toBe(texts.review(note.right, texts.places[note.pitch]))
    })
  })
})
