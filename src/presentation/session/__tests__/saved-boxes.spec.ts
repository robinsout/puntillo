import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import {
  chooseLength,
  chooseShownDuration,
  createMemoryStorage,
  loadSession,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature language-and-naming, slice 4: both boxes are kept between page loads (criterion 8).

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const AT_ONCE = 'Show the right answer at once'
const AUTO_NEXT = 'Open next question automatically'
const TRY_AGAIN = 'Incorrect. Try again.'
const REVIEW_OF_C4 = 'You chose re. This is do: the note on the first ledger line below the staff.'

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const status = () => screen.getByRole('status').textContent?.trim()
const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')
const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name })

// A new render over the same storage stands for a page reload. Questions alternate C4 (do),
// D4 (re)…
function reload(storage: KeyValueStorage, browserLanguages: readonly string[] = ['en']) {
  cleanup()
  loadSession(storage, browserLanguages)
}

async function answer(name: string) {
  await fireEvent.click(button(name))
  await chooseShownDuration()
  await fireEvent.click(button('Check'))
}

// Until slice 3 of the duration feature the quick mode answers on a name press with the
// duration chosen before it.
async function pressQuick(name: string) {
  await chooseShownDuration()
  await fireEvent.click(button(name))
}

// Records every write, so a test can tell that nothing was saved.
function recordingStorage() {
  const storage = createMemoryStorage()
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

// Garbage under every key, as a damaged storage could hold.
const storageHolding = (value: string): KeyValueStorage => ({
  get: () => value,
  set: () => {},
  canSave: () => true,
})

async function tickAutoNextOnQuestion(storage: KeyValueStorage) {
  loadSession(storage)
  await chooseLength('No limit')
  await fireEvent.click(box(AUTO_NEXT))
}

describe('the box "Show the right answer at once" after a reload', () => {
  it('stays ticked once ticked', async () => {
    const storage = createMemoryStorage()
    loadSession(storage)
    await fireEvent.click(box(AT_ONCE))

    reload(storage)

    expect(box(AT_ONCE).checked).toBe(true)
  })

  it('still shows the right answer at once after a wrong first answer', async () => {
    const storage = createMemoryStorage()
    loadSession(storage)
    await fireEvent.click(box(AT_ONCE))
    reload(storage)
    await chooseLength('No limit')

    await answer('re')

    expect(status()).toBe(REVIEW_OF_C4)
    expect(queryButton('Next')).not.toBeNull()
  })

  it('stays unticked once unticked again', async () => {
    const storage = createMemoryStorage()
    loadSession(storage)
    await fireEvent.click(box(AT_ONCE))
    await fireEvent.click(box(AT_ONCE))

    reload(storage)

    expect(box(AT_ONCE).checked).toBe(false)
    await chooseLength('No limit')
    await answer('re')
    expect(status()).toBe(TRY_AGAIN)
  })

  it('stays ticked when ticked in an earlier session of the same page', async () => {
    const storage = createMemoryStorage()
    loadSession(storage)
    await fireEvent.click(box(AT_ONCE))
    await chooseLength('No limit')
    await answer('do')
    await fireEvent.click(button('Finish'))
    await fireEvent.click(button('New session'))

    reload(storage)

    expect(box(AT_ONCE).checked).toBe(true)
  })

  it('leaves the other box unticked', async () => {
    const storage = createMemoryStorage()
    loadSession(storage)
    await fireEvent.click(box(AT_ONCE))

    reload(storage)
    await chooseLength('No limit')

    expect(box(AUTO_NEXT).checked).toBe(false)
    expect(queryButton('Check')).not.toBeNull()
  })

  it('is kept under its name in another language', async () => {
    const storage = createMemoryStorage()
    loadSession(storage, ['en'])
    await fireEvent.click(box(AT_ONCE))

    reload(storage, ['ru'])

    expect(box('Сразу показывать правильный ответ').checked).toBe(true)
  })
})

describe('the box "Open next question automatically" after a reload', () => {
  it('is ticked on the first question once ticked', async () => {
    const storage = createMemoryStorage()
    await tickAutoNextOnQuestion(storage)

    reload(storage)
    await chooseLength('No limit')

    expect(box(AUTO_NEXT).checked).toBe(true)
  })

  it('answers with one press, without Check', async () => {
    const storage = createMemoryStorage()
    await tickAutoNextOnQuestion(storage)
    reload(storage)
    await chooseLength('No limit')
    expect(queryButton('Check')).toBeNull()
    expect(shownPitch()).toBe('C4')

    await pressQuick('do')

    expect(shownPitch()).toBe('D4')
    expect(status()).toBe('Correct')
    expect(screen.queryByText('Points: 2 of 2')).not.toBeNull()
  })

  it('stays unticked once unticked again', async () => {
    const storage = createMemoryStorage()
    await tickAutoNextOnQuestion(storage)
    await fireEvent.click(box(AUTO_NEXT))

    reload(storage)
    await chooseLength('No limit')

    expect(box(AUTO_NEXT).checked).toBe(false)
    expect(queryButton('Check')).not.toBeNull()
  })

  it('leaves the other box unticked', async () => {
    const storage = createMemoryStorage()
    await tickAutoNextOnQuestion(storage)

    reload(storage)

    expect(box(AT_ONCE).checked).toBe(false)
  })

  it('keeps the second attempt in the quick mode', async () => {
    const storage = createMemoryStorage()
    await tickAutoNextOnQuestion(storage)
    reload(storage)
    await chooseLength('No limit')

    await pressQuick('re')

    expect(shownPitch()).toBe('C4')
    expect(status()).toBe(TRY_AGAIN)
  })
})

describe('both boxes after a reload', () => {
  it('are both kept ticked', async () => {
    const storage = createMemoryStorage()
    loadSession(storage)
    await fireEvent.click(box(AT_ONCE))
    await chooseLength('No limit')
    await fireEvent.click(box(AUTO_NEXT))

    reload(storage)
    expect(box(AT_ONCE).checked).toBe(true)
    await chooseLength('No limit')
    expect(box(AUTO_NEXT).checked).toBe(true)

    await pressQuick('re')

    expect(shownPitch()).toBe('C4')
    expect(status()).toBe(REVIEW_OF_C4)
  })

  it('save nothing until one of them is changed', async () => {
    const { storage, writes } = recordingStorage()
    loadSession(storage)
    await chooseLength('10')
    await answer('do')
    await fireEvent.click(button('Next'))
    await fireEvent.click(button('Finish'))
    await fireEvent.click(button('New session'))

    expect(writes).toEqual([])
  })

  it('do not save the browser language', async () => {
    const storage = createMemoryStorage()
    loadSession(storage, ['ru'])
    await fireEvent.click(box('Сразу показывать правильный ответ'))

    reload(storage, ['es'])

    expect(box('Mostrar la respuesta correcta de inmediato').checked).toBe(true)
  })
})

describe('both boxes with a damaged storage', () => {
  it.each(['', 'True', '1', 'yes', 'on', '"true"', 'klingon'])(
    'are unticked and work as unticked: %j',
    async (value) => {
      loadSession(storageHolding(value))
      expect(box(AT_ONCE).checked).toBe(false)

      await chooseLength('No limit')
      expect(box(AUTO_NEXT).checked).toBe(false)
      await answer('re')

      expect(status()).toBe(TRY_AGAIN)
    },
  )
})

describe('both boxes with an unavailable storage', () => {
  it('work until a reload, then are unticked again', async () => {
    const storage = unavailableStorage()
    loadSession(storage)
    await fireEvent.click(box(AT_ONCE))
    await chooseLength('No limit')
    await fireEvent.click(box(AUTO_NEXT))

    await pressQuick('re')
    expect(status()).toBe(REVIEW_OF_C4)

    reload(storage)
    expect(box(AT_ONCE).checked).toBe(false)
    await chooseLength('No limit')
    expect(box(AUTO_NEXT).checked).toBe(false)
    expect(queryButton('Check')).not.toBeNull()
  })

  it('keep the box ticked between sessions of the same page', async () => {
    loadSession(unavailableStorage())
    await fireEvent.click(box(AT_ONCE))
    await chooseLength('No limit')
    await answer('do')
    await fireEvent.click(button('Finish'))
    await fireEvent.click(button('New session'))

    expect(box(AT_ONCE).checked).toBe(true)
  })
})
