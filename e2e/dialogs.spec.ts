import { expect, test, type Locator, type Page } from '@playwright/test'
import { openSettings } from './settings'

// Feature design-system, slice 7, criterion 11, edge case 5 in a real browser: the panel Customize
// is a sheet of the system, from the bottom of a phone and at the right of a wide screen, Done kept
// at the bottom of the panel in view; the hint and Keyboard shortcuts are dialogs of the system in
// the middle of the screen. Every control is at least 44 × 44 and nothing scrolls sideways. The
// focus stays inside a dialog and comes back on Esc; "reduce motion" leaves a dialog unanimated.
// A new user, First steps.

test.use({ locale: 'en-US' })

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Customize', exact: true })
const done = (page: Page) => panel(page).getByRole('button', { name: 'Done', exact: true })
const HINT_TITLE = 'Notes on the treble staff'
const hint = (page: Page) => page.getByRole('dialog', { name: HINT_TITLE, exact: true })
const shortcuts = (page: Page) =>
  page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true })

async function openCustomize(page: Page, sections: readonly string[] = []) {
  await page.goto('/')
  await button(page, 'Customize').click()
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).locator('svg .vf-stavenote').first()).toBeAttached()
  for (const name of sections) {
    const section = panel(page).getByRole('button', { name, exact: true })
    await section.click()
    await expect(section).toHaveAttribute('aria-expanded', 'true')
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

async function openHint(page: Page) {
  await button(page, 'Help: Ledger lines').click()
  await expect(hint(page)).toBeVisible()
  await expect(hint(page).getByRole('img').locator('svg .vf-stavenote').first()).toBeVisible()
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('not rendered')
  return box
}

async function expectTarget(locator: Locator, what: string) {
  const box = await boxOf(locator)
  // Layout is fractional: Firefox reports 2.75rem as 43.99997px.
  expect(box.width, `width of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(box.height, `height of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
}

async function expectNoHorizontalScroll(page: Page, dialog: Locator) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, 'overflow of the page').toBe(0)
  const own = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(own, 'overflow of the dialog').toBeLessThanOrEqual(0)
}

// The length of a token in px, as the browser resolves it.
function tokenPx(page: Page, token: string) {
  return page.evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.width = `var(${name})`
    document.body.append(probe)
    const width = probe.getBoundingClientRect().width
    probe.remove()
    return width
  }, token)
}

// A colour token as the browser computes it, to compare with computed borders.
function tokenColor(page: Page, token: string) {
  return page.evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.color = `var(${name})`
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, token)
}

// The controls of a value are hidden radios and boxes: their label is what is pressed.
const labelOf = (control: Locator) => control.locator('xpath=ancestor::label[1]')

async function expectPanelTargets(page: Page) {
  for (const name of ['Pitch', 'Rhythm', 'Signs', 'Done'])
    await expectTarget(panel(page).getByRole('button', { name, exact: true }), name)
  for (const help of await panel(page)
    .getByRole('button', { name: /^Help: / })
    .all())
    await expectTarget(help, (await help.getAttribute('aria-label')) ?? 'help')
  for (const list of await panel(page).getByRole('combobox').all())
    await expectTarget(list, 'a list')
  for (const control of [
    ...(await panel(page).getByRole('radio').all()),
    ...(await panel(page).getByRole('checkbox').all()),
  ])
    await expectTarget(labelOf(control), (await labelOf(control).textContent())?.trim() ?? '')
}

// The focus may leave the page for the browser itself, but never land behind the dialog on top.
const focusInside = (dialog: Locator) =>
  dialog.evaluate((element) => {
    const active = document.activeElement
    return !active || active === document.body || element.contains(active)
  })

// WebKit on macOS tabs only through form fields; buttons need Option+Tab.
const tabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab')

const seconds = (duration: string) =>
  Math.max(
    ...duration
      .split(',')
      .map((part) => part.trim())
      .map((part) => (part.endsWith('ms') ? parseFloat(part) / 1000 : parseFloat(part))),
  )

const motionOf = (dialog: Locator) =>
  dialog.evaluate((element) => {
    const { animationName, animationDuration } = getComputedStyle(element)
    return { animationName, animationDuration }
  })

test.describe('Customize on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('is a sheet from the bottom, full width, Done in view at its bottom, its targets large enough', async ({
    page,
  }) => {
    await openCustomize(page, ['Rhythm', 'Signs'])

    const sheet = await boxOf(panel(page))
    expect(sheet.x).toBeCloseTo(0, 0)
    expect(sheet.width).toBeCloseTo(360, 0)
    expect(sheet.y + sheet.height).toBeCloseTo(640, 0)

    // All three sections expanded are taller than the sheet, and Done stays in view without
    // scrolling to the end of them. Pressing Signs may have scrolled the panel: back to its top.
    await panel(page).evaluate((dialog) => {
      for (const element of [dialog, ...dialog.querySelectorAll('*')]) element.scrollTop = 0
    })
    const accidentals = await boxOf(panel(page).getByRole('radio').last())
    expect(accidentals.y, 'the last value, below the sheet').toBeGreaterThan(sheet.y + sheet.height)
    const doneBox = await boxOf(done(page))
    expect(doneBox.y, 'top of Done').toBeGreaterThanOrEqual(sheet.y)
    expect(doneBox.y + doneBox.height, 'bottom of Done').toBeLessThanOrEqual(640 + 0.5)
    expect(doneBox.width, 'width of Done').toBeGreaterThan(360 / 2)

    await expectPanelTargets(page)
    await expectNoHorizontalScroll(page, panel(page))
  })
})

test.describe('Customize on a 1440 px wide screen', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('is a panel at the right, full height and as wide as the token, Done at the bottom of the window', async ({
    page,
  }) => {
    await openCustomize(page)

    const side = await boxOf(panel(page))
    expect(side.y).toBeCloseTo(0, 0)
    expect(side.height).toBeCloseTo(900, 0)
    expect(side.x + side.width).toBeCloseTo(1440, 0)
    expect(side.width).toBeCloseTo(await tokenPx(page, '--width-panel'), 0)

    const doneBox = await boxOf(done(page))
    const gap = 900 - (doneBox.y + doneBox.height)
    expect(gap, 'from Done to the bottom of the window').toBeGreaterThanOrEqual(0)
    expect(gap, 'from Done to the bottom of the window').toBeLessThanOrEqual(
      2 * (await tokenPx(page, '--space-l')),
    )
  })
})

test.describe('the dialogs on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('show the hint in the middle, inside the screen, its controls large enough', async ({
    page,
  }) => {
    await openCustomize(page)

    await openHint(page)

    const box = await boxOf(hint(page))
    expect(box.x, 'left edge').toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, 'right edge').toBeLessThanOrEqual(360)
    expect(Math.abs(box.x - (360 - box.x - box.width)), 'off the middle').toBeLessThanOrEqual(1)
    expect(box.y, 'top edge').toBeGreaterThanOrEqual(0)
    expect(box.y + box.height, 'bottom edge').toBeLessThanOrEqual(640)
    await expectTarget(
      hint(page).getByRole('link', { name: 'Read the article' }),
      'Read the article',
    )
    await expectTarget(hint(page).getByRole('button', { name: 'Close', exact: true }), 'Close')
    await expectNoHorizontalScroll(page, hint(page))
  })

  test('show Keyboard shortcuts in the middle, its rows ruled and its keys framed', async ({
    page,
  }) => {
    await page.goto('/')
    await openSettings(page)

    await button(page, 'Keyboard shortcuts').click()

    const dialog = shortcuts(page)
    await expect(dialog).toBeVisible()
    const box = await boxOf(dialog)
    expect(box.x, 'left edge').toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, 'right edge').toBeLessThanOrEqual(360)
    expect(Math.abs(box.x - (360 - box.x - box.width)), 'off the middle').toBeLessThanOrEqual(1)
    await expectTarget(dialog.getByRole('button', { name: 'Close', exact: true }), 'Close')
    await expectNoHorizontalScroll(page, dialog)

    const line = await tokenColor(page, '--color-line')
    const unruled = await dialog.evaluate((element, color) => {
      const ruled = (cell: Element, side: 'Top' | 'Bottom') => {
        const style = getComputedStyle(cell)
        return (
          style[`border${side}Style`] === 'solid' &&
          parseFloat(style[`border${side}Width`]) > 0 &&
          style[`border${side}Color`] === color
        )
      }
      const parts = (row: HTMLTableRowElement) => [row, ...row.cells]
      return [...element.querySelectorAll('table')].flatMap((table) =>
        [...table.rows].slice(1).flatMap((row, index) => {
          const above = table.rows[index] as HTMLTableRowElement
          const apart =
            parts(above).some((part) => ruled(part, 'Bottom')) ||
            parts(row).some((part) => ruled(part, 'Top'))
          return apart ? [] : [row.textContent?.trim() ?? '']
        }),
      )
    }, line)
    expect(unruled, 'rows with no line above them').toEqual([])

    const radius = await tokenPx(page, '--radius-s')
    const keys = await dialog.locator('kbd').evaluateAll((elements) =>
      elements.map((key) => {
        const style = getComputedStyle(key)
        return {
          style: style.borderTopStyle,
          width: parseFloat(style.borderTopWidth),
          radius: parseFloat(style.borderTopLeftRadius),
        }
      }),
    )
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(key.style, 'frame of a key').toBe('solid')
      expect(key.width, 'frame of a key').toBeGreaterThan(0)
      expect(key.radius, 'corner of a key').toBeCloseTo(radius, 0)
    }
  })
})

test.describe('the keyboard and the focus in the dialogs', () => {
  test('keep the focus inside the hint over Customize, and Esc closes each, the focus back', async ({
    page,
    browserName,
  }) => {
    await openCustomize(page)
    await button(page, 'Help: Ledger lines').focus()
    await page.keyboard.press('Enter')
    await expect(hint(page)).toBeVisible()

    for (let step = 0; step < 4; step++) {
      expect(await focusInside(hint(page)), `focus after ${step} presses of Tab`).toBe(true)
      await page.keyboard.press(tabKey(browserName))
    }
    await page.keyboard.press('Escape')
    await expect(hint(page)).toBeHidden()
    await expect(panel(page)).toBeVisible()
    await expect(button(page, 'Help: Ledger lines')).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()
    await expect(button(page, 'Customize')).toBeFocused()
  })

  test('keep the focus inside Keyboard shortcuts, and Esc closes it, the focus back', async ({
    page,
    browserName,
  }) => {
    await page.goto('/')
    await openSettings(page)
    await button(page, 'Keyboard shortcuts').focus()
    await page.keyboard.press('Enter')
    await expect(shortcuts(page)).toBeVisible()

    for (let step = 0; step < 3; step++) {
      expect(await focusInside(shortcuts(page)), `focus after ${step} presses of Tab`).toBe(true)
      await page.keyboard.press(tabKey(browserName))
    }
    await page.keyboard.press('Escape')
    await expect(shortcuts(page)).toBeHidden()
    await expect(button(page, 'Keyboard shortcuts')).toBeFocused()
  })
})

test.describe('the dialogs and reduced motion', () => {
  test('come in with a short animation without the system setting', async ({ page }) => {
    await openCustomize(page)
    await openHint(page)

    for (const dialog of [panel(page), hint(page)]) {
      const motion = await motionOf(dialog)
      expect(motion.animationName).not.toBe('none')
      expect(seconds(motion.animationDuration)).toBeGreaterThan(0)
      expect(seconds(motion.animationDuration)).toBeLessThanOrEqual(0.3)
    }
  })

  test('come in unanimated with it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openCustomize(page)
    await openHint(page)

    for (const dialog of [panel(page), hint(page)]) {
      const motion = await motionOf(dialog)
      expect(seconds(motion.animationDuration)).toBeLessThanOrEqual(0.001)
    }
  })
})
