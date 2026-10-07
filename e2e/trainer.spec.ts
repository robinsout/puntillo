import { expect, test, type Locator, type Page } from '@playwright/test'

// Сквозные проверки тренажёра: настоящий VexFlow в настоящих браузерах.
//
// Ноту выбирает Math.random, поэтому он подменяется до загрузки страницы.
// Значение постоянно в пределах шага, так что посторонние вызовы Math.random
// (VexFlow, Vite) последовательность не сбивают. Генератор берёт первую ноту
// из восьми C4–C5 по floor(x × 8), каждую следующую — из семи без предыдущей
// по floor(x × 7). При x = 0 вопросы чередуются: C4 (do), D4 (re), C4…

const NAMES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si']

const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element is not laid out')
  return box
}

// Доходит до кнопки клавишей Tab, как пользователь клавиатуры.
// WebKit на macOS по Tab обходит только поля ввода, кнопки — по Option+Tab.
async function tabTo(page: Page, browserName: string, name: string) {
  const key = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
  const target = button(page, name)
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press(key)
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error(`"${name}" is not reachable with Tab`)
}

type RandomWindow = Window & { puntilloRandom: number }

async function fixRandom(page: Page, value: number) {
  await page.addInitScript((initial) => {
    const random = window as unknown as RandomWindow
    random.puntilloRandom = initial
    Math.random = () => random.puntilloRandom
  }, value)
}

async function setRandom(page: Page, value: number) {
  await page.evaluate((next) => {
    ;(window as unknown as RandomWindow).puntilloRandom = next
  }, value)
}

// Высота ноты по геометрии, как в тестах адаптера: на сколько ступеней
// (половин межлинейного расстояния) головка выше нижней линии.
// E4 — 0, C4 — −2, G4 — 2, C5 — 5.
function noteStepAboveBottomLine(page: Page) {
  return staff(page)
    .locator('svg')
    .evaluate((svg) => {
      const lines = [...svg.querySelectorAll('.vf-stave path')]
        .map((path) => /^M\s*[\d.-]+[\s,]+([\d.-]+)/.exec(path.getAttribute('d') ?? '')?.[1])
        .filter((y): y is string => y !== undefined)
        .map(Number)
        .sort((a, b) => a - b)
      const [top, second] = lines
      const bottom = lines.at(-1)
      const head = svg.querySelector('.vf-notehead text')
      if (top === undefined || second === undefined || bottom === undefined || !head) {
        throw new Error('staff or notehead not rendered')
      }
      const halfSpace = (second - top) / 2
      return Math.round((bottom - Number(head.getAttribute('y'))) / halfSpace)
    })
}

async function openTrainer(page: Page) {
  await page.goto('/')
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  // Ширины глифов VexFlow меряет по шрифту Bravura: раскладка верна только после его загрузки.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

test.beforeEach(async ({ page }) => {
  await fixRandom(page, 0)
})

test.describe('trainer', () => {
  test('draws a staff with a treble clef, a time signature and one note', async ({ page }) => {
    await openTrainer(page)

    const svg = staff(page).locator('svg')
    await expect(svg).toHaveCount(1)
    await expect(svg.locator('.vf-stave')).toHaveCount(1)
    await expect(svg.locator('.vf-clef')).toHaveCount(1)
    await expect(svg.locator('.vf-timesignature')).toHaveCount(1)
    await expect(svg.locator('.vf-stavenote')).toHaveCount(1)
    await expect(svg.locator('.vf-notehead')).toHaveCount(1)
  })

  test('places the note to the right of the clef and the time signature', async ({ page }) => {
    await openTrainer(page)

    const svg = staff(page).locator('svg')
    const clef = await boxOf(svg.locator('.vf-clef'))
    const time = await boxOf(svg.locator('.vf-timesignature'))
    const head = await boxOf(svg.locator('.vf-notehead'))
    const drawing = await boxOf(svg)

    // Глифы имеют настоящую ширину: до загрузки шрифта она была бы нулевой.
    expect(clef.width).toBeGreaterThan(0)
    expect(time.width).toBeGreaterThan(0)
    expect(head.width).toBeGreaterThan(0)
    // Ключ, размер и нота идут слева направо, не накладываясь.
    expect(time.x).toBeGreaterThanOrEqual(clef.x + clef.width)
    expect(head.x).toBeGreaterThanOrEqual(time.x + time.width)
    // Нота внутри рисунка.
    expect(head.x + head.width).toBeLessThanOrEqual(drawing.x + drawing.width)
  })

  test('names the page Puntillo', async ({ page }) => {
    await openTrainer(page)

    await expect(page).toHaveTitle('Puntillo')
  })

  test('moves the focus to Next after Check and back to Check after Next', async ({
    page,
    browserName,
  }) => {
    await openTrainer(page)

    await tabTo(page, browserName, 'do')
    await page.keyboard.press('Enter')
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'true')
    await tabTo(page, browserName, 'Check')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toHaveText('Correct')
    await expect(button(page, 'Next')).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(button(page, 'Check')).toBeFocused()
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'false')
  })

  test('shows seven note name buttons from do to si', async ({ page }) => {
    await openTrainer(page)

    for (const name of NAMES) {
      await expect(button(page, name)).toBeVisible()
    }
  })

  test('grades answers and moves to the next question', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')

    await button(page, 'do').click()
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'true')
    await button(page, 'Check').click()
    await expect(status).toHaveText('Correct')
    await expect(button(page, 'Check')).toHaveCount(0)

    await button(page, 'Next').click()
    await expect(page.getByText(/^(Correct|Incorrect)$/)).toHaveCount(0)
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'false')
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)

    // Второй вопрос — D4.
    await button(page, 'mi').click()
    await button(page, 'Check').click()
    await expect(status).toHaveText('Incorrect')
    await expect(button(page, 'Next')).toBeVisible()
  })

  test('disables the note name buttons after Check and enables them after Next', async ({
    page,
  }) => {
    await openTrainer(page)

    await button(page, 're').click()
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Incorrect')
    for (const name of NAMES) {
      await expect(button(page, name)).toBeDisabled()
    }
    await expect(button(page, 're')).toHaveAttribute('aria-pressed', 'true')

    await button(page, 'Next').click()
    for (const name of NAMES) {
      await expect(button(page, name)).toBeEnabled()
      await expect(button(page, name)).toHaveAttribute('aria-pressed', 'false')
    }
  })

  test('asks to choose a note name when checking without one', async ({ page }) => {
    await openTrainer(page)

    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Choose a note name first')
    await expect(page.getByText(/^(Correct|Incorrect)$/)).toHaveCount(0)
    await expect(button(page, 'Check')).toBeVisible()
  })

  test('makes every interactive element at least 44 by 44 CSS pixels', async ({ page }) => {
    await openTrainer(page)
    // Проверяем оба состояния кнопки действия: Check и Next.
    // Во втором кнопки названий неактивны, но видимы и тоже должны быть не меньше 44×44.
    const states = [
      async () => {},
      async () => {
        await button(page, 'do').click()
        await button(page, 'Check').click()
        await expect(button(page, 'Next')).toBeVisible()
      },
    ]

    for (const enter of states) {
      await enter()
      const controls = page
        .locator('button, a[href], input, select, textarea, [role="button"]')
        .filter({ visible: true })
      const count = await controls.count()
      expect(count).toBeGreaterThanOrEqual(NAMES.length + 1)
      for (let index = 0; index < count; index++) {
        const control = controls.nth(index)
        const box = await boxOf(control)
        const label = (await control.textContent())?.trim()
        expect(box.width, `width of "${label}"`).toBeGreaterThanOrEqual(44)
        expect(box.height, `height of "${label}"`).toBeGreaterThanOrEqual(44)
      }
    }
  })
})

test.describe('trainer questions', () => {
  test('draws a note of another pitch after each Next, at its place on the staff', async ({
    page,
  }) => {
    // 0.5 → G4 (пятая из восьми); 0.9 → C5 (седьмая из семи без G4);
    // 0 → C4 (первая из семи без C5).
    // Скрипты инициализации идут по порядку: это значение заменяет 0 из beforeEach.
    await fixRandom(page, 0.5)
    await openTrainer(page)
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(2)

    await setRandom(page, 0.9)
    await button(page, 'sol').click()
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Correct')
    await button(page, 'Next').click()
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(5)

    await setRandom(page, 0)
    await button(page, 'do').click()
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Correct')
    await button(page, 'Next').click()
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  })
})

test.describe('trainer on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the staff without horizontal scrolling', async ({ page }) => {
    await openTrainer(page)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    const drawing = await boxOf(staff(page).locator('svg'))
    expect(drawing.x).toBeGreaterThanOrEqual(0)
    expect(drawing.x + drawing.width).toBeLessThanOrEqual(360)
  })
})
