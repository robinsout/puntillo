import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { section } from './navigation'

// Feature visit-counter, slice 3 of 3, in a real browser: the box Don't count my visits of the
// screen Settings keeps the switch robinsout-counter-off in localStorage, shared by the projects of
// the origin, over a reload (criterion 5); a browser that does not save it gets the box disabled
// with a line saying why (edge case 1); the switch is neither in the progress file nor changed by
// it (edge case 2). That nothing is sent with the switch on is checked on the counter itself, in
// src/infrastructure/analytics: the dev server and the preview count nothing anyway.

test.use({ locale: 'en-US' })

const OFF_KEY = 'robinsout-counter-off'
const BOX = "Don't count my visits"
const NOTE = 'No cookies or IP; the day, device type and screen are counted.'
const NOT_SAVED = "Your browser doesn't let this choice be saved."

const box = (page: Page) => page.getByRole('checkbox', { name: BOX, exact: true })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true })
const switchKept = (page: Page) => page.evaluate((key) => localStorage.getItem(key), OFF_KEY)

async function openSettingsPage(page: Page) {
  await page.goto('/settings')
  await expect(heading(page, 'Settings')).toBeVisible()
}

async function exportProgress(page: Page): Promise<string> {
  await section(page, 'Progress').click()
  await expect(heading(page, 'Progress')).toBeVisible()
  const download = page.waitForEvent('download')
  await button(page, 'Export progress').click()
  return readFile(await (await download).path(), 'utf8')
}

async function importProgress(page: Page, text: string) {
  await section(page, 'Progress').click()
  await expect(heading(page, 'Progress')).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await button(page, 'Import progress').click()
  await (
    await chooser
  ).setFiles({
    name: 'puntillo-progress.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await button(page, 'Replace').click()
  await expect(page.getByRole('status').filter({ hasText: 'Progress imported.' })).toBeVisible()
}

test.describe("the box Don't count my visits (criterion 5)", () => {
  test('is in the group Privacy, described by what is counted', async ({ page }) => {
    await openSettingsPage(page)

    const privacy = page.getByRole('region', { name: 'Privacy', exact: true })
    await expect(privacy.getByRole('checkbox', { name: BOX, exact: true })).toBeVisible()
    await expect(box(page)).toHaveAccessibleDescription(NOTE)
    await expect(box(page)).not.toBeChecked()
    await expect(box(page)).toBeEnabled()
  })

  test('ticked, keeps the switch over a reload', async ({ page }) => {
    await openSettingsPage(page)

    await box(page).check()

    expect(await switchKept(page)).toBe('1')
    await page.reload()
    await expect(heading(page, 'Settings')).toBeVisible()
    await expect(box(page)).toBeChecked()
    expect(await switchKept(page)).toBe('1')
  })

  test('unticked, removes the switch, and stays unticked over a reload', async ({ page }) => {
    await openSettingsPage(page)
    await box(page).check()

    await box(page).uncheck()

    expect(await switchKept(page)).toBeNull()
    await page.reload()
    await expect(heading(page, 'Settings')).toBeVisible()
    await expect(box(page)).not.toBeChecked()
  })

  test('is ticked when another project of the origin turned the switch on', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, '1'), OFF_KEY)

    await openSettingsPage(page)

    await expect(box(page)).toBeChecked()
  })
})

test.describe('the box when the browser does not save it (edge case 1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
        if (this === window.localStorage) {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        }
        setItem.call(this, key, value)
      }
    })
  })

  test('is shown disabled, with a line saying why', async ({ page }) => {
    await openSettingsPage(page)

    await expect(box(page)).toBeVisible()
    await expect(box(page)).toBeDisabled()
    await expect(page.getByText(NOT_SAVED, { exact: true })).toBeVisible()
  })
})

test.describe('the switch and the progress file (edge case 2)', () => {
  test('is not in the exported file', async ({ page }) => {
    await openSettingsPage(page)
    await box(page).check()

    const file = await exportProgress(page)

    expect(file).not.toContain(OFF_KEY)
    expect(file).not.toMatch(/counter/i)
  })

  test('is not turned off by importing a file', async ({ page }) => {
    await openSettingsPage(page)
    const file = await exportProgress(page)
    await section(page, 'Settings').click()
    await box(page).check()

    await importProgress(page, file)

    expect(await switchKept(page)).toBe('1')
    await section(page, 'Settings').click()
    await expect(box(page)).toBeChecked()
  })

  test('is not turned on by importing a file exported with it on', async ({ page }) => {
    await openSettingsPage(page)
    await box(page).check()
    const file = await exportProgress(page)
    await section(page, 'Settings').click()
    await box(page).uncheck()

    await importProgress(page, file)

    expect(await switchKept(page)).toBeNull()
    await section(page, 'Settings').click()
    await expect(box(page)).not.toBeChecked()
  })
})
