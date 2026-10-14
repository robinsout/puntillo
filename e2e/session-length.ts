import type { Locator, Page } from '@playwright/test'

// Feature navigation-and-settings, slice 3: the session length is one choice of radio buttons on
// the start screen, each cell the label of its radio button, which is hidden from the eye. A press
// on a length only chooses it; Start begins the session, in the language of the page.

const LENGTH_GROUP = /^(Session length|Длина сессии|Duración de la sesión)$/
const START = /^(Start|Начать|Empezar)$/

export const lengthGroup = (page: Page) => page.getByRole('radiogroup', { name: LENGTH_GROUP })

export const lengthOption = (page: Page, name: string) =>
  lengthGroup(page).getByRole('radio', { name, exact: true })

export const startButton = (page: Page) => page.getByRole('button', { name: START })

// What the user presses: the label around the radio button or the one that names it by its id.
export async function lengthCell(page: Page, name: string): Promise<Locator> {
  const option = lengthOption(page, name)
  const id = await option.getAttribute('id')
  return id ? page.locator(`label[for="${id}"]`) : option.locator('xpath=ancestor::label')
}

export async function chooseLength(page: Page, name: string) {
  await (await lengthCell(page, name)).click()
}

export async function startSession(page: Page, length: string) {
  await chooseLength(page, length)
  await startButton(page).click()
}
