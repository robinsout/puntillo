import { fileURLToPath } from 'node:url'
import { expect, type Page } from '@playwright/test'
import { backToTrainer } from './settings'
import { startSession } from './session-length'

// Feature microphone-input: no one plays into the runner, so Chromium takes a recorded note for its
// microphone, a trumpet-like tone between silences, played over and over
// (scripts/render-microphone-sounds.mjs). The flags are Chromium's and start the browser, so a
// spec file plays one sound, and runs in Chromium alone: no title names what playwright.config.ts
// sends to the other engines.
export const fakeMicrophonePlaying = (sound: string) => ({
  locale: 'en-US',
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--mute-audio',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${fileURLToPath(new URL(`./fixtures/${sound}`, import.meta.url))}`,
    ],
  },
})

// The message of the trainer, not a line of the state of the microphone.
export const status = (page: Page) => page.getByRole('status').filter({ hasNotText: 'Microphone' })

const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })

// Math.random is a constant 0, so First steps asks D4 (re4) first. The page opens on the settings,
// where Microphone and, if given, the instrument are chosen as the user does.
export async function openQuestion(
  page: Page,
  {
    showAnswerAtOnce = false,
    instrument,
  }: { showAnswerAtOnce?: boolean; instrument?: string } = {},
) {
  await page.addInitScript(() => {
    Math.random = () => 0
    if (localStorage.getItem('puntillo.preset') === null)
      localStorage.setItem('puntillo.preset', 'first-steps')
  })
  await page.goto('/settings')
  await page
    .getByRole('combobox', { name: 'Note input', exact: true })
    .selectOption({ label: 'Microphone' })
  if (instrument)
    await page
      .getByRole('combobox', { name: 'Instrument', exact: true })
      .selectOption({ label: instrument })
  if (showAnswerAtOnce)
    await page.getByRole('checkbox', { name: 'Show the right answer at once' }).check()
  await backToTrainer(page)
  await startSession(page, 'No limit')
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
}

type RandomWindow = Window & { puntilloQueue: number[] }

// Confident reading with 2–4 notes in 4/4, no signs, the duration not asked, as in
// note-names.spec.ts: the values queued right before the session make the notes of the question.
const SEVERAL_NOTES = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  keySignatures: 0,
  accidentals: 'none',
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: false,
  questionLength: 'two-to-four-notes',
  timeSignatures: ['4/4'],
  rests: false,
  dots: false,
})

export const DO_MI_SOL = [0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0]
export const DO_MI_DO = [0.4, 0, 0, 1.5 / 11, 0, 0, 0]

// Math.random gives the queued values first, then a constant 0. The page opens on the settings,
// where Microphone is chosen as the user does; the question has the three notes of the values.
export async function openQuestionOfThreeNotes(page: Page, values: readonly number[]) {
  await page.addInitScript((saved) => {
    const random = window as unknown as RandomWindow
    random.puntilloQueue = []
    Math.random = () => random.puntilloQueue.shift() ?? 0
    if (localStorage.getItem('puntillo.preset') !== null) return
    localStorage.setItem('puntillo.preset', 'confident-reading')
    localStorage.setItem('puntillo.difficulty', saved)
  }, SEVERAL_NOTES)
  await page.goto('/settings')
  await page
    .getByRole('combobox', { name: 'Note input', exact: true })
    .selectOption({ label: 'Microphone' })
  await backToTrainer(page)
  await page.evaluate((queued) => {
    ;(window as unknown as RandomWindow).puntilloQueue = [...queued]
  }, values)
  await startSession(page, 'No limit')
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(3)
}
