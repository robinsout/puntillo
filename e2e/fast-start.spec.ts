import { expect, test, type Page, type Request } from '@playwright/test'
import { openSettings } from './settings'
import { startButton, startSession } from './session-length'

// Feature fast-start, criteria 1, 2 and the edge case 1: the examples of the level cards are
// drawings in the build, so VexFlow is loaded only when a staff is drawn by it: a session, the
// panel Customize. The start screen, Settings, Progress without hard notes and the list of the
// help topics do without it. VexFlow is any script whose file name holds "vexflow": its chunk in
// the build, its prebundled module and the adapter's own modules in the dev server.
//
// A new user, so First steps; Math.random is fixed at 0.

const PRESETS = ['First steps', 'Confident reading', 'Advanced']

const card = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const exampleIn = (page: Page, name: string) =>
  card(page, name).getByRole('img', { name: 'Example' })
const customize = (page: Page) => page.getByRole('button', { name: 'Customize', exact: true })

const isVexFlow = (request: Request) =>
  /vexflow/i.test(new URL(request.url()).pathname.split('/').pop() ?? '')

// The requests for VexFlow made from now on.
function watchVexFlow(page: Page) {
  const requests: string[] = []
  page.on('request', (request) => {
    if (isVexFlow(request)) requests.push(request.url())
  })
  return requests
}

// A staff line is a path with no height, which Playwright takes for hidden: the svg is checked.
async function examplesDrawn(page: Page) {
  for (const name of PRESETS) {
    const svg = exampleIn(page, name).locator('svg')
    await expect(svg).toBeVisible()
    await expect(svg.locator('path')).not.toHaveCount(0)
  }
}

// The scripts of the page are loaded, and a staff mounted by now has asked for VexFlow: it does
// on mount.
async function settled(page: Page) {
  await page.waitForLoadState('load')
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
  )
}

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0
  })
})

test.describe('start without the notation renderer', () => {
  test('loads no VexFlow on the start screen, its examples drawn', async ({ page }) => {
    const requests = watchVexFlow(page)

    await page.goto('/')
    await expect(startButton(page)).toBeVisible()
    await examplesDrawn(page)
    await settled(page)

    expect(requests).toEqual([])
  })

  for (const path of ['/settings', '/progress', '/wiki']) {
    test(`loads no VexFlow on ${path}`, async ({ page }) => {
      const requests = watchVexFlow(page)

      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await settled(page)

      expect(requests).toEqual([])
    })
  }

  test('loads no VexFlow on the way from the start screen to Settings', async ({ page }) => {
    const requests = watchVexFlow(page)
    await page.goto('/')
    await examplesDrawn(page)

    await openSettings(page)
    await settled(page)

    expect(requests).toEqual([])
  })

  test('loads VexFlow once Start is pressed', async ({ page }) => {
    await page.goto('/')
    await examplesDrawn(page)

    const loaded = page.waitForRequest(isVexFlow)
    await startSession(page, '10')

    await loaded
    await expect(page.locator('svg .vf-stavenote').first()).toBeVisible()
  })

  test('loads VexFlow once Customize is opened', async ({ page }) => {
    await page.goto('/')
    await examplesDrawn(page)

    const loaded = page.waitForRequest(isVexFlow)
    await customize(page).click()

    await loaded
    await expect(
      page.getByRole('dialog', { name: 'Customize' }).locator('svg .vf-stavenote').first(),
    ).toBeVisible()
  })

  test('keeps the examples and tells of the staff in a session when the network is gone', async ({
    page,
  }) => {
    // Only the library itself: the dev server serves the adapter's own modules apart from it.
    await page.route(/vexflow[-_]bravura/, (route) => route.abort('internetdisconnected'))
    await page.goto('/')
    await examplesDrawn(page)

    await startSession(page, '10')

    await expect(page.getByRole('alert')).toHaveText("Couldn't load the staff. Reload the page.")
  })
})
