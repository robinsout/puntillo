import { expect, test, type Locator, type Page } from '@playwright/test'
import { backToTrainer, openSettings } from './settings'

// Feature navigation-and-settings, slice 1, in a real browser (spec §16, §17): the settings screen
// at its own address with three groups (criterion 7), the language changed there at once and kept
// on the trainer (criterion 8), the screen on a 360 px wide screen with every target at least
// 44 × 44, and the link Settings on the choice screen reached with Tab.

test.use({ locale: 'en-US' })

const link = (page: Page, name: string) => page.getByRole('link', { name, exact: true })
const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true })
const h2 = (page: Page, name: string) => page.getByRole('heading', { level: 2, name, exact: true })
const list = (page: Page, name: string) => page.getByRole('combobox', { name, exact: true })

const GROUPS = ['General', 'Read notes', 'Write notes']

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// Layout is fractional: Firefox reports 2.75rem as 43.99997px, which is still a 44px target.
function expectTarget(
  box: { x: number; width: number; height: number } | null | undefined,
  what: string,
) {
  expect(box?.width, `width of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(box?.height, `height of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(box?.x, `left edge of ${what}`).toBeGreaterThanOrEqual(0)
  expect(box && box.x + box.width, `right edge of ${what}`).toBeLessThanOrEqual(360)
}

// Clicking the label toggles a checkbox or a radio, so either one is its hit area; the largest
// one counts.
function largestTargetOf(input: Locator) {
  return input.evaluate((element: HTMLInputElement) => {
    const labels = [...(element.labels ?? [])]
    const boxes = [element, ...labels].map((target) => {
      const { x, width, height } = target.getBoundingClientRect()
      return { x, width, height }
    })
    boxes.sort((a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height))
    return { name: labels[0]?.textContent?.trim() ?? '', largest: boxes[0] }
  })
}

// WebKit on macOS tabs only through form fields; links and buttons need Option+Tab. The walk
// starts from the heading; controls above it are reached backwards.
async function tabTo(page: Page, browserName: string, target: Locator) {
  const first = page.locator('h1').first()
  const above = await target.evaluate(
    (element, headingElement) =>
      Boolean(headingElement.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING),
    await first.elementHandle().then((handle) => handle!),
  )
  const key = `${browserName === 'webkit' ? 'Alt+' : ''}${above ? 'Shift+' : ''}Tab`
  await first.focus()
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press(key)
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error(`${String(target)} is not reachable with Tab`)
}

test.describe('the settings screen', () => {
  test('opens at its own address with its three groups and leads back by Trainer', async ({
    page,
  }) => {
    await page.goto('/settings')

    await expect(h1(page, 'Settings')).toBeVisible()
    for (const name of GROUPS) await expect(h2(page, name)).toBeVisible()

    await link(page, 'Trainer').click()

    await expect(h1(page, 'Session length')).toBeVisible()
    await expect(page).not.toHaveURL(/\/settings$/)
  })

  test('opens from the link Settings on the choice screen', async ({ page }) => {
    await page.goto('/')

    await openSettings(page)

    await expect(page).toHaveURL(/\/settings$/)
  })

  test('changes the language at once and keeps it on the choice screen', async ({ page }) => {
    await page.goto('/')
    await openSettings(page)

    await list(page, 'Language').selectOption({ label: 'Русский' })

    await expect(h1(page, 'Настройки')).toBeVisible()
    await expect(h2(page, 'Общие')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await backToTrainer(page, 'ru')
    await expect(h1(page, 'Длина сессии')).toBeVisible()
  })
})

test.describe('the settings screen with the keyboard', () => {
  test('reaches Settings from the start screen with Tab and focuses its heading', async ({
    page,
    browserName,
  }) => {
    await page.goto('/')
    await expect(link(page, 'Settings')).toBeVisible()

    await tabTo(page, browserName, link(page, 'Settings'))
    await page.keyboard.press('Enter')

    await expect(h1(page, 'Settings')).toBeFocused()
  })

  test('focuses its heading when loaded at its address, ready for the keyboard', async ({
    page,
  }) => {
    await page.goto('/settings')

    await expect(h1(page, 'Settings')).toBeFocused()
  })
})

test.describe('the settings screen on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('settings on a 360 px wide screen: no horizontal scroll, every target 44 × 44', async ({
    page,
  }) => {
    await page.goto('/settings')
    // Every setting shown: the seventh note with letters, the boxes of the piano keys.
    await list(page, 'Note names').selectOption({ label: 'C, D, E' })
    await list(page, 'Note input').selectOption({ label: 'Piano keyboard' })
    await expect(page.getByRole('checkbox', { name: 'Play the keys', exact: true })).toBeVisible()
    for (const name of GROUPS) await expect(h2(page, name)).toBeVisible()

    await expectNoHorizontalScroll(page)
    const controls = page
      .getByRole('main')
      .locator('button, a[href], select')
      .filter({ visible: true })
    const count = await controls.count()
    expect(count).toBeGreaterThanOrEqual(4)
    for (let index = 0; index < count; index++) {
      const control = controls.nth(index)
      const what = (await control.getAttribute('aria-label')) ?? (await control.textContent())
      expectTarget(await control.boundingBox(), `"${what?.trim()}"`)
    }
    const inputs = page
      .getByRole('main')
      .locator('input[type="checkbox"], input[type="radio"]')
      .filter({ visible: true })
    const inputCount = await inputs.count()
    expect(inputCount).toBeGreaterThanOrEqual(6)
    for (let index = 0; index < inputCount; index++) {
      const { name, largest } = await largestTargetOf(inputs.nth(index))
      expectTarget(largest, `the "${name}" box`)
    }
  })
})
