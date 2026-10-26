import { expect, test } from '@playwright/test'
import { fakeMicrophonePlaying, openQuestion, status } from './microphone'
import { muteAudio } from './mute-audio'

// Feature microphone-input, slice 1, in a real browser (spec §16): with Microphone chosen in the
// settings, a note played into the microphone answers the question of Read notes and the question
// is checked with no Check (criteria 1, 4, 6, 10). The microphone of Chromium plays re4, the note
// asked (./microphone.ts).

test.use(fakeMicrophonePlaying('trumpet-re4.wav'))

test.beforeEach(({ page }) => muteAudio(page))

test.describe('answering by playing the note of the question', () => {
  test('says Correct with no Check, then Next opens the next question', async ({ page }) => {
    await openQuestion(page)
    await expect(page.getByRole('button', { name: 'Check', exact: true })).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Piano keyboard' })).toHaveCount(0)

    await expect(status(page)).toHaveText('Correct', { timeout: 10_000 })
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    await expect(page.getByText('Question 2')).toBeVisible()
  })
})
