import { expect, test, type Page } from '@playwright/test'
import { muteAudio } from './mute-audio'

// Feature midi-input, slice 1, in a real browser (spec §16): ticking Use a MIDI keyboard asks the
// browser for MIDI, and a key of the instrument answers the question of Read notes as the key on
// the screen does (criteria 2, 4); a key beyond the keyboard on the screen is a wrong answer the
// review names (criterion 6); both boxes are saved and the access is asked for again when the page
// opens (criteria 1, 2, 7). No instrument is plugged into the runner: the page gets a fake Web MIDI
// access with one input, which the test plays through the page.
//
// No title has "keyboard" in it: those are the scenarios of the computer keyboard
// (playwright.config.ts picks the engines by the titles).

test.use({ locale: 'en-US' })

test.beforeEach(({ page }) => muteAudio(page))

const MIDI_BOX = 'Use a MIDI keyboard'
const MIDI_SOUND_BOX = 'Play sound for the MIDI keys'

interface FakeMidi {
  __midiRequests?: unknown[]
  __midiPress?: (number: number) => void
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const box = (page: Page, name: string) => page.getByRole('checkbox', { name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const status = (page: Page) => page.getByRole('status')
const piano = (page: Page) => page.getByRole('group', { name: 'Piano keyboard', exact: true })

// Math.random is a constant 0, so First steps, with Piano keyboard as saved on an earlier visit,
// asks D4 (re4) first, on do4 to do5. The browser answers a request for MIDI with one input; a
// note on sent to it reaches whoever listens, by onmidimessage or by addEventListener.
async function visit(page: Page) {
  await page.addInitScript(() => {
    Math.random = () => 0
    if (localStorage.getItem('puntillo.noteInput') === null) {
      localStorage.setItem('puntillo.preset', 'first-steps')
      localStorage.setItem('puntillo.noteInput', 'keyboard')
    }

    class FakeInput extends EventTarget {
      readonly id = 'fake-piano'
      readonly name = 'Fake piano'
      readonly manufacturer = 'Puntillo'
      readonly type = 'input'
      readonly state = 'connected'
      connection = 'open'
      onmidimessage: ((event: Event) => void) | null = null
      open() {
        return Promise.resolve(this)
      }
      close() {
        return Promise.resolve(this)
      }
      send(bytes: number[]) {
        const event = Object.assign(new Event('midimessage'), { data: new Uint8Array(bytes) })
        this.dispatchEvent(event)
        this.onmidimessage?.(event)
      }
    }

    const input = new FakeInput()
    const access = Object.assign(new EventTarget(), {
      inputs: new Map([[input.id, input]]),
      outputs: new Map(),
      sysexEnabled: false,
      onstatechange: null,
    })
    const page = window as FakeMidi
    page.__midiRequests = []
    page.__midiPress = (number) => input.send([0x90, number, 100])
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: (options: unknown) => {
        page.__midiRequests?.push(options)
        return Promise.resolve(access)
      },
    })
  })
  await page.goto('/')
  await expect(box(page, 'Play the keys')).toBeVisible()
}

const requests = (page: Page) =>
  page.evaluate(() => (window as FakeMidi).__midiRequests?.length ?? 0)

async function playOnInstrument(page: Page, number: number) {
  await page.evaluate((key) => (window as FakeMidi).__midiPress?.(key), number)
}

async function openQuestion(page: Page) {
  await button(page, 'No limit').click()
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  await expect(piano(page)).toBeVisible()
}

test.describe('answering on a MIDI instrument', () => {
  test('ticking the MIDI box asks the browser for MIDI, then a key of the instrument and Enter say Correct', async ({
    page,
  }) => {
    await visit(page)

    await box(page, MIDI_BOX).check()
    await expect.poll(() => requests(page)).toBe(1)
    await openQuestion(page)
    await playOnInstrument(page, 62)

    await expect(piano(page).getByRole('button', { name: 're4', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.keyboard.press('Enter')
    await expect(status(page)).toHaveText('Correct')
  })

  test('a key of the instrument beyond the piano on the screen is named by the review', async ({
    page,
  }) => {
    await visit(page)
    await box(page, MIDI_BOX).check()
    await box(page, 'Show the right answer at once').check()
    await openQuestion(page)

    await playOnInstrument(page, 36)
    await button(page, 'Check').click()

    await expect(status(page)).toContainText('You played do2. This is re4')
  })
})

test.describe('the MIDI boxes', () => {
  test('are kept over a reload, and the access is asked for as the page opens', async ({
    page,
  }) => {
    await visit(page)
    await box(page, MIDI_BOX).check()
    await box(page, MIDI_SOUND_BOX).check()

    await page.reload()

    await expect(box(page, MIDI_BOX)).toBeChecked()
    await expect(box(page, MIDI_SOUND_BOX)).toBeChecked()
    await expect.poll(() => requests(page)).toBe(1)
  })
})
