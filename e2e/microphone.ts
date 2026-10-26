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
// where Microphone is chosen as the user does.
export async function openQuestion(page: Page, { showAnswerAtOnce = false } = {}) {
  await page.addInitScript(() => {
    Math.random = () => 0
    if (localStorage.getItem('puntillo.preset') === null)
      localStorage.setItem('puntillo.preset', 'first-steps')
  })
  await page.goto('/settings')
  await page
    .getByRole('combobox', { name: 'Note input', exact: true })
    .selectOption({ label: 'Microphone' })
  if (showAnswerAtOnce)
    await page.getByRole('checkbox', { name: 'Show the right answer at once' }).check()
  await backToTrainer(page)
  await startSession(page, 'No limit')
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
}
