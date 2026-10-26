import { expect, test } from '@playwright/test'
import { fakeMicrophonePlaying, openQuestion, status } from './microphone'
import { muteAudio } from './mute-audio'

// Feature microphone-input, slice 3, in a real browser (spec §16): with an instrument in B♭ chosen
// in the settings, the note played is heard a major second above its sound (criteria 2, 9). The
// microphone of Chromium plays do4, the sound of re4, the note asked, on a trumpet
// (./microphone.ts).

test.use(fakeMicrophonePlaying('trumpet-do4.wav'))

test.beforeEach(({ page }) => muteAudio(page))

test('a trumpet in B♭ answers the written note a tone above its sound', async ({ page }) => {
  await openQuestion(page, { instrument: 'In B♭: trumpet, clarinet' })

  await expect(status(page)).toHaveText('Correct', { timeout: 10_000 })
})
