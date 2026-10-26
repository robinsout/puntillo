import { expect, test } from '@playwright/test'
import { fakeMicrophonePlaying, openQuestion, status } from './microphone'
import { muteAudio } from './mute-audio'

// Feature microphone-input, slice 1, in a real browser (spec §16): a note played is an answer, right
// or wrong, and the review names the note played (criteria 8, 10). The microphone of Chromium plays
// mi4 while re4 is asked (./microphone.ts).

test.use(fakeMicrophonePlaying('trumpet-mi4.wav'))

test.beforeEach(({ page }) => muteAudio(page))

test('the review names the note played into the microphone', async ({ page }) => {
  await openQuestion(page, { showAnswerAtOnce: true })

  await expect(status(page)).toContainText('You played mi4. This is re4', { timeout: 10_000 })
})
