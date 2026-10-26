import { expect, test } from '@playwright/test'
import { DO_MI_SOL, fakeMicrophonePlaying, openQuestionOfThreeNotes, status } from './microphone'
import { muteAudio } from './mute-audio'

// Feature microphone-input, slice 2, in a real browser (spec §16): a question of several notes takes
// the notes played in turn and is checked with the last one, with no Check (criterion 10). The
// microphone of Chromium plays do4, mi4 and sol4, the notes asked, between short silences.

test.use(fakeMicrophonePlaying('trumpet-do4-mi4-sol4.wav'))

test.beforeEach(({ page }) => muteAudio(page))

test('a question of several notes played in turn says Correct with no Check', async ({ page }) => {
  await openQuestionOfThreeNotes(page, DO_MI_SOL)
  await expect(page.getByRole('button', { name: 'Check', exact: true })).toHaveCount(0)

  await expect(status(page)).toHaveText('Correct', { timeout: 15_000 })
})
