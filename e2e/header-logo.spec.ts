import { expect, test, type Locator, type Page } from '@playwright/test'

// Feature header-logo, slice 1, in a real browser: the sign of the app in the header before the
// name Puntillo, as high as the name, inside its link home (criteria 1, 2). On a 360 px wide screen
// the header stays one row with no horizontal scroll (edge case 1), and with the text at 200 % the
// sign grows with the name (edge case 2).

test.use({ locale: 'en-US', viewport: { width: 360, height: 640 } })

const title = (page: Page) => page.getByRole('banner').getByRole('link', { name: 'Puntillo' })
const sign = (page: Page) => title(page).locator('svg')

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${String(locator)} has no box`)
  return box
}

// The box of the words of the title, without the sign beside them.
const nameBoxOf = (page: Page) =>
  title(page).evaluate((link) => {
    const range = document.createRange()
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT)
    const texts: Text[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.trim()) texts.push(node as Text)
    }
    const first = texts[0]
    const last = texts[texts.length - 1]
    if (!first || !last) throw new Error('the title has no text')
    range.setStart(first, 0)
    range.setEnd(last, last.length)
    const box = range.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  })

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

async function expectSignBesideName(page: Page) {
  await expect(sign(page)).toBeVisible()
  const logo = await boxOf(sign(page))
  const name = await nameBoxOf(page)
  expect(logo.x + logo.width, 'the sign left of Puntillo').toBeLessThanOrEqual(name.x + 0.5)
  expect(logo.height, 'height of the sign').toBeGreaterThanOrEqual(name.height * 0.7)
  expect(logo.height, 'height of the sign').toBeLessThanOrEqual(name.height * 1.3)
  await expectNoHorizontalScroll(page)
  return logo
}

test.describe('the logo in the header on a 360 px wide screen', () => {
  for (const path of ['/', '/progress', '/settings']) {
    test(`stands before Puntillo, as high as it, on ${path}`, async ({ page }) => {
      await page.goto(path)

      const logo = await expectSignBesideName(page)
      expect(logo.width, 'width of the sign').toBeGreaterThan(0)
    })
  }

  test('grows with the name when the text is at 200 %', async ({ page }) => {
    await page.goto('/')
    const before = await expectSignBesideName(page)

    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
      .toBe('32px')

    const after = await expectSignBesideName(page)
    expect(after.height).toBeGreaterThan(before.height)
  })

  test('leads to the trainer when pressed', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

    await sign(page).click()

    await expect(page).toHaveURL(/\/$/)
  })
})
