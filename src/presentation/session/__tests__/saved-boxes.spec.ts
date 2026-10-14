import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import {
  backToTrainer,
  openSettings,
  renderApp,
  renderSettings,
} from '@/presentation/__tests__/app'
import {
  startSession,
  chooseShownDuration,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  progressOver,
  renderSessionWith,
  startingOnC4,
  statusText,
  storageWithPreset,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature language-and-naming, slice 4: both boxes are kept between page loads (criterion 8).
// Feature navigation-and-settings, slice 1: both boxes are on the settings screen; the quick mode
// box is no longer on the question screen.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const AT_ONCE = 'Show the right answer at once'
const AUTO_NEXT = 'Open next question automatically'
const TRY_AGAIN = 'Incorrect. Try again.'
const REVIEW_OF_C4 = 'You chose re. This is do: the note on the first ledger line below the staff.'

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const status = statusText
const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')
const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name })
const queryBox = (name: string) => screen.queryByRole('checkbox', { name })

// A page load on the settings screen or on the choice screen: the saved preferences are read, the
// browser languages are the fallback. The storages hold Confident reading, which asks for the
// duration; questions alternate C4 (do), D4 (re)…
const loadSettings = (storage: KeyValueStorage, browserLanguages: readonly string[] = ['en']) =>
  renderSettings({ storage, preferences: preferencesFor(browserLanguages, storage) })
const loadTrainer = (storage: KeyValueStorage) => renderApp({ storage })

// A new render over the same storage stands for a page reload.
async function reload(storage: KeyValueStorage, browserLanguages: readonly string[] = ['en']) {
  cleanup()
  await loadSettings(storage, browserLanguages)
}

async function reloadOnTrainer(storage: KeyValueStorage) {
  cleanup()
  await loadTrainer(storage)
}

async function startNoLimit() {
  await backToTrainer()
  await startSession('No limit')
}

async function answer(name: string) {
  await fireEvent.click(button(name))
  await chooseShownDuration()
  await fireEvent.click(button('Check'))
}

// The right duration first, so the name press completes the answer: quick-mode-duration.spec.ts
// covers the other order and a wrong duration.
async function pressQuick(name: string) {
  await chooseShownDuration()
  await fireEvent.click(button(name))
}

// Records every write, so a test can tell that nothing was saved.
function recordingStorage() {
  const storage = storageWithPreset('confident-reading')
  const writes: string[] = []
  const recording: KeyValueStorage = {
    get: (key) => storage.get(key),
    set: (key, value) => {
      writes.push(`${key}=${value}`)
      storage.set(key, value)
    },
    canSave: () => storage.canSave(),
  }
  return { storage: recording, writes }
}

// A damaged or unavailable storage leaves a new user's First steps: the duration is not asked, and
// questions alternate D4 (re), E4 (mi)…
const REVIEW_OF_D4 = 'You chose mi. This is re: the note just below the staff.'

async function answerName(name: string) {
  await fireEvent.click(button(name))
  await fireEvent.click(button('Check'))
}

// Garbage under every key, as a damaged storage could hold.
const storageHolding = (value: string): KeyValueStorage => ({
  get: () => value,
  set: () => {},
  canSave: () => true,
})

async function tickAutoNext(storage: KeyValueStorage) {
  await loadSettings(storage)
  await fireEvent.click(box(AUTO_NEXT))
}

describe('the box "Show the right answer at once" after a reload', () => {
  it('stays ticked once ticked', async () => {
    const storage = storageWithPreset('confident-reading')
    await loadSettings(storage)
    await fireEvent.click(box(AT_ONCE))

    await reload(storage)

    expect(box(AT_ONCE).checked).toBe(true)
  })

  it('still shows the right answer at once after a wrong first answer', async () => {
    const storage = storageWithPreset('confident-reading')
    await loadSettings(storage)
    await fireEvent.click(box(AT_ONCE))
    await reloadOnTrainer(storage)
    await startSession('No limit')

    await answer('re')

    expect(status()).toBe(REVIEW_OF_C4)
    expect(queryButton('Next')).not.toBeNull()
  })

  it('stays unticked once unticked again', async () => {
    const storage = storageWithPreset('confident-reading')
    await loadSettings(storage)
    await fireEvent.click(box(AT_ONCE))
    await fireEvent.click(box(AT_ONCE))

    await reload(storage)

    expect(box(AT_ONCE).checked).toBe(false)
    await startNoLimit()
    await answer('re')
    expect(status()).toBe(TRY_AGAIN)
  })

  it('stays ticked when ticked in an earlier session of the same page', async () => {
    const storage = storageWithPreset('confident-reading')
    await loadSettings(storage)
    await fireEvent.click(box(AT_ONCE))
    await startNoLimit()
    await answer('do')
    await fireEvent.click(button('Finish'))
    await fireEvent.click(button('New session'))

    await reload(storage)

    expect(box(AT_ONCE).checked).toBe(true)
  })

  it('leaves the other box unticked', async () => {
    const storage = storageWithPreset('confident-reading')
    await loadSettings(storage)
    await fireEvent.click(box(AT_ONCE))

    await reload(storage)

    expect(box(AUTO_NEXT).checked).toBe(false)
    await startNoLimit()
    expect(queryButton('Check')).not.toBeNull()
  })

  it('is kept under its name in another language', async () => {
    const storage = storageWithPreset('confident-reading')
    await loadSettings(storage, ['en'])
    await fireEvent.click(box(AT_ONCE))

    await reload(storage, ['ru'])

    expect(box('Сразу показывать правильный ответ').checked).toBe(true)
  })
})

describe('the box "Open next question automatically" after a reload', () => {
  it('is ticked on the settings screen once ticked', async () => {
    const storage = storageWithPreset('confident-reading')
    await tickAutoNext(storage)

    await reload(storage)

    expect(box(AUTO_NEXT).checked).toBe(true)
  })

  it('answers with one press, without Check or the box on the question', async () => {
    const storage = storageWithPreset('confident-reading')
    await tickAutoNext(storage)
    await reloadOnTrainer(storage)
    await startSession('No limit')
    expect(queryButton('Check')).toBeNull()
    expect(queryBox(AUTO_NEXT)).toBeNull()
    expect(shownPitch()).toBe('C4')

    await pressQuick('do')

    expect(shownPitch()).toBe('D4')
    expect(status()).toBe('Correct')
    expect(screen.queryByText('Accuracy 100%')).not.toBeNull()
  })

  it('stays unticked once unticked again', async () => {
    const storage = storageWithPreset('confident-reading')
    await tickAutoNext(storage)
    await fireEvent.click(box(AUTO_NEXT))

    await reload(storage)

    expect(box(AUTO_NEXT).checked).toBe(false)
    await startNoLimit()
    expect(queryButton('Check')).not.toBeNull()
  })

  it('leaves the other box unticked', async () => {
    const storage = storageWithPreset('confident-reading')
    await tickAutoNext(storage)

    await reload(storage)

    expect(box(AT_ONCE).checked).toBe(false)
  })

  it('keeps the second attempt in the quick mode', async () => {
    const storage = storageWithPreset('confident-reading')
    await tickAutoNext(storage)
    await reloadOnTrainer(storage)
    await startSession('No limit')

    await pressQuick('re')

    expect(shownPitch()).toBe('C4')
    expect(status()).toBe(TRY_AGAIN)
  })
})

describe('both boxes after a reload', () => {
  it('are both kept ticked', async () => {
    const storage = storageWithPreset('confident-reading')
    await loadSettings(storage)
    await fireEvent.click(box(AT_ONCE))
    await fireEvent.click(box(AUTO_NEXT))

    await reload(storage)
    expect(box(AT_ONCE).checked).toBe(true)
    expect(box(AUTO_NEXT).checked).toBe(true)
    await startNoLimit()

    await pressQuick('re')

    expect(shownPitch()).toBe('C4')
    expect(status()).toBe(REVIEW_OF_C4)
  })

  // The answers of the session go to the statistics, which are no part of the boxes: the progress
  // keeps them in a storage of its own here.
  it('save nothing until one of them is changed', async () => {
    const { storage, writes } = recordingStorage()
    renderSessionWith({
      random: startingOnC4(),
      clock: createManualClock().clock,
      preferences: preferencesFor(['en'], storage),
      progress: progressOver(createMemoryStorage()),
    })
    await startSession('10')
    await answer('do')
    await fireEvent.click(button('Next'))
    await fireEvent.click(button('Finish'))
    await fireEvent.click(button('New session'))

    expect(writes).toEqual([])
  })

  it('do not save the browser language', async () => {
    const storage = storageWithPreset('confident-reading')
    await loadSettings(storage, ['ru'])
    await fireEvent.click(box('Сразу показывать правильный ответ'))

    await reload(storage, ['es'])

    expect(box('Mostrar la respuesta correcta de inmediato').checked).toBe(true)
  })
})

describe('both boxes with a damaged storage', () => {
  it.each(['', 'True', '1', 'yes', 'on', '"true"', 'klingon'])(
    'are unticked and work as unticked: %j',
    async (value) => {
      await loadSettings(storageHolding(value))
      expect(box(AT_ONCE).checked).toBe(false)
      expect(box(AUTO_NEXT).checked).toBe(false)

      await startNoLimit()
      await answerName('mi')

      expect(status()).toBe(TRY_AGAIN)
    },
  )
})

describe('both boxes with an unavailable storage', () => {
  it('work until a reload, then are unticked again', async () => {
    const storage = unavailableStorage()
    await loadSettings(storage)
    await fireEvent.click(box(AT_ONCE))
    await fireEvent.click(box(AUTO_NEXT))
    await startNoLimit()

    await fireEvent.click(button('mi'))
    expect(status()).toBe(REVIEW_OF_D4)

    await reload(storage)
    expect(box(AT_ONCE).checked).toBe(false)
    expect(box(AUTO_NEXT).checked).toBe(false)
    await startNoLimit()
    expect(queryButton('Check')).not.toBeNull()
  })

  it('keep the box ticked between sessions of the same page', async () => {
    await loadSettings(unavailableStorage())
    await fireEvent.click(box(AT_ONCE))
    await startNoLimit()
    await answerName('re')
    await fireEvent.click(button('Finish'))
    await fireEvent.click(button('New session'))
    await openSettings()

    expect(box(AT_ONCE).checked).toBe(true)
  })
})
