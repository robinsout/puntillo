import { expect, type Page } from '@playwright/test'
import { section, type Language } from './navigation'

// Feature navigation-and-settings, slice 1: the settings moved from the choice screen and the
// question to a screen of their own; slice 2: it is reached by the tab Settings of the navigation
// and left by the tab Trainer.

export type { Language }

export const SETTINGS: Record<Language, string> = { en: 'Settings', ru: 'Настройки', es: 'Ajustes' }
export const TRAINER: Record<Language, string> = {
  en: 'Trainer',
  ru: 'Тренажёр',
  es: 'Entrenador',
}

const settingsHeading = (page: Page, language: Language) =>
  page.getByRole('heading', { level: 1, name: SETTINGS[language], exact: true })

export async function openSettings(page: Page, language: Language = 'en') {
  await section(page, SETTINGS[language], language).click()
  await expect(settingsHeading(page, language)).toBeVisible()
}

export async function backToTrainer(page: Page, language: Language = 'en') {
  await section(page, TRAINER[language], language).click()
  await expect(settingsHeading(page, language)).toHaveCount(0)
}

// From the choice screen to the settings and back, with a change made there. A change of the
// language leaves the settings in the new one, so the way back is named in it.
export async function changeSettings(
  page: Page,
  change: () => Promise<unknown>,
  { from = 'en', to = from }: { from?: Language; to?: Language } = {},
) {
  await openSettings(page, from)
  await change()
  await backToTrainer(page, to)
}
