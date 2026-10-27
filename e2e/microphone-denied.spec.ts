import { expect, test } from '@playwright/test'
import { openQuestion } from './microphone'
import { muteAudio } from './mute-audio'

// Feature microphone-input, slice 4, in a real browser (spec §16): where the browser does not
// allow the microphone, the settings and the question say so, and Change note input leads from
// the question to the settings (criterion 14, edge case 5). Chromium is given a microphone but no
// permission to use it, and no fake prompt to accept one, so it refuses every request; the flags
// are Chromium's, so the file runs in Chromium alone.

const DENIED = "The browser didn't allow the microphone. Allow it in the site settings."

test.use({
  locale: 'en-US',
  launchOptions: { args: ['--mute-audio', '--use-fake-device-for-media-stream'] },
})

test.beforeEach(({ page }) => muteAudio(page))

test('a microphone not allowed is told, and Change note input leads to the settings', async ({
  page,
}) => {
  await openQuestion(page)

  await expect(page.getByRole('status').filter({ hasText: DENIED })).toHaveText(DENIED)
  await expect(page.getByTestId('hearing-indicator')).toHaveCount(0)
  await page.getByRole('link', { name: 'Change note input', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Note input', exact: true }),
  ).toHaveAccessibleDescription(DENIED)
})
