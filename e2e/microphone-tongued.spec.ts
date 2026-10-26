import { expect, test } from '@playwright/test'
import { DO_MI_DO, fakeMicrophonePlaying, openQuestionOfThreeNotes, status } from './microphone'
import { muteAudio } from './mute-audio'

// Feature microphone-input, slice 2, in a real browser (spec §16): the second attempt is played, the
// notes marked wrong in turn (criterion 10), and the same note twice in a row is two notes when it
// is tongued again, its sound falling for a moment, not to silence (criterion 11). Do4, mi4 and do4
// are asked; the microphone of Chromium plays re4, mi4 and re4, then do4 tongued twice.

test.use(fakeMicrophonePlaying('trumpet-re4-mi4-re4-do4-do4.wav'))

test.beforeEach(({ page }) => muteAudio(page))

test('a note tongued twice answers the two notes of the second attempt', async ({ page }) => {
  await openQuestionOfThreeNotes(page, DO_MI_DO)

  await expect(status(page)).toHaveText('Incorrect. Try again.', { timeout: 15_000 })
  await expect(status(page)).toHaveText('Correct on the second try', { timeout: 15_000 })
})
