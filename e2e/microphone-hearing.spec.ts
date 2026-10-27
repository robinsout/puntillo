import { expect, test } from '@playwright/test'
import { fakeMicrophonePlaying, openQuestion } from './microphone'
import { muteAudio } from './mute-audio'

// Feature microphone-input, slice 4, in a real browser (spec §16): over the staff of the question
// the indicator names the note the microphone hears, and the line of the state says the
// microphone listens (criteria 13, 14). The microphone of Chromium plays re4 (./microphone.ts).

test.use(fakeMicrophonePlaying('trumpet-re4.wav'))

test.beforeEach(({ page }) => muteAudio(page))

test('the indicator names the note heard and the line says the microphone listens', async ({
  page,
}) => {
  await openQuestion(page)

  await expect(page.getByRole('status').filter({ hasText: 'Microphone: listening' })).toHaveText(
    'Microphone: listening',
  )
  await expect(page.getByTestId('hearing-indicator')).toContainText('re4', { timeout: 10_000 })
})
