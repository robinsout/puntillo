import { expect, test, type Page } from '@playwright/test'

// Feature design-system, slice 1, criteria 1, 2 and edge case 5 in a real browser: the app is in
// palette A, set in Source Sans 3 and Source Serif 4 from the build itself, and "reduce motion"
// stops the transitions and animations.

const computed = (page: Page, selector: string, property: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element, name) => {
      return getComputedStyle(element).getPropertyValue(name)
    }, property)

async function loadedFaces(page: Page, font: string, text: string) {
  return page.evaluate(
    async ({ font, text }) => {
      await document.fonts.ready
      const faces = await document.fonts.load(font, text)
      return {
        faces: faces.filter((face) => face.status === 'loaded').length,
        ready: document.fonts.check(font, text),
      }
    },
    { font, text },
  )
}

const seconds = (duration: string) =>
  Math.max(
    ...duration
      .split(',')
      .map((part) => part.trim())
      .map((part) => (part.endsWith('ms') ? parseFloat(part) / 1000 : parseFloat(part))),
  )

test.describe('the design system on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('palette and fonts on a 360 px wide screen', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    expect(await computed(page, 'body', 'background-color')).toBe('rgb(247, 242, 231)')
    expect(await computed(page, 'body', 'color')).toBe('rgb(34, 32, 28)')
    expect(await computed(page, 'body', 'font-family')).toMatch(/^"?Source Sans 3"?,/)
    expect(await computed(page, 'h1', 'font-family')).toMatch(/^"?Source Serif 4"?,/)

    // Cyrillic text, so the faces cover more than Latin.
    for (const [font, text] of [
      ['700 16px "Source Sans 3"', 'Тренажёр'],
      ['600 16px "Source Serif 4"', 'Длина'],
    ] as const) {
      const { faces, ready } = await loadedFaces(page, font, text)
      expect(faces, font).toBeGreaterThan(0)
      expect(ready, font).toBe(true)
    }

    const app = new URL(page.url()).origin
    const elsewhere = requests.filter((url) => /^https?:/.test(url) && new URL(url).origin !== app)
    expect(elsewhere).toEqual([])
  })
})

// A probe with a transition and an animation of its own: "reduce motion" has to stop whatever
// moves, not only what base.css itself moves.
async function motionOfProbe(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  return page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes probe { to { opacity: 0.5; } }
      button.motion-probe { transition: opacity 300ms; animation: probe 300ms infinite; }
    `
    document.head.append(style)
    const probe = document.createElement('button')
    probe.className = 'motion-probe'
    probe.textContent = 'Probe'
    document.body.append(probe)
    const { transitionDuration, animationDuration } = getComputedStyle(probe)
    return { transitionDuration, animationDuration }
  })
}

test.describe('reduced motion', () => {
  test('moves a button without the system setting', async ({ page }) => {
    const motion = await motionOfProbe(page)

    expect(seconds(motion.transitionDuration)).toBeCloseTo(0.3)
    expect(seconds(motion.animationDuration)).toBeCloseTo(0.3)
  })

  test('stops the transitions and animations of a button with it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })

    const motion = await motionOfProbe(page)

    expect(seconds(motion.transitionDuration)).toBeLessThanOrEqual(0.001)
    expect(seconds(motion.animationDuration)).toBeLessThanOrEqual(0.001)
  })
})
