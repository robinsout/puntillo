import type { Locator, Page } from '@playwright/test'

// Feature navigation-and-settings, slice 4: Exercise is a switch of two segments on the start
// screen, each segment the label of a radio button hidden from the eye. Either a fieldset with a
// legend or an element with role="radiogroup" names the pair.

const EXERCISE = /^(Exercise|Упражнение|Ejercicio)$/

export const exerciseGroup = (page: Page) =>
  page.getByRole('radiogroup', { name: EXERCISE }).or(page.getByRole('group', { name: EXERCISE }))

export const exerciseOption = (page: Page, name: string) =>
  exerciseGroup(page).getByRole('radio', { name, exact: true })

// What the user presses: the label around the radio button or the one that names it by its id.
export async function exerciseSegment(page: Page, name: string): Promise<Locator> {
  const option = exerciseOption(page, name)
  const id = await option.getAttribute('id')
  return id ? page.locator(`label[for="${id}"]`) : option.locator('xpath=ancestor::label')
}

export async function chooseExercise(page: Page, name: string) {
  await (await exerciseSegment(page, name)).click()
}
