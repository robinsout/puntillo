import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { StaffView } from '@/infrastructure/notation'
import type { Letter } from '@/domain/pitch'
import type { Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

// Адаптер рисует вывод VexFlow, поэтому наблюдаемый результат — его SVG:
// группы vf-* и глифы SMuFL. Высота ноты читается по геометрии: на сколько
// ступеней (половин межлинейного расстояния) головка выше нижней линии.
// В jsdom нет canvas и measureText, ширины глифов нулевые, но вертикальная
// раскладка от этого не зависит.

const GLYPH = {
  gClef: '',
  timeSig4: '',
  noteheadWhole: '',
} as const

const questionOn = (letter: Letter, octave = 4): Question =>
  createQuestion({ pitch: { letter, octave }, duration: { value: 'whole' } })

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

function render(question: Question, label = 'Music staff') {
  wrapper = mount(StaffView, { props: { question, label }, attachTo: document.body })
  return wrapper
}

const all = (root: Element, selector: string) => [...root.querySelectorAll(selector)]

const glyphs = (root: Element, selector: string) =>
  all(root, `${selector} text`).map((text) => text.textContent)

// Линии нотоносца — горизонтальные пути внутри группы vf-stave, сверху вниз.
function staffLineYs(root: Element): number[] {
  return all(root, '.vf-stave path')
    .map((path) => /^M\s*[\d.-]+[\s,]+([\d.-]+)/.exec(path.getAttribute('d') ?? '')?.[1])
    .filter((y): y is string => y !== undefined)
    .map(Number)
    .sort((a, b) => a - b)
}

// Ступени над нижней линией: E4 — 0, C4 — −2, G4 — 2, C5 — 5.
function noteStepAboveBottomLine(root: Element): number {
  const lines = staffLineYs(root)
  const [top, second] = lines
  const bottom = lines.at(-1)
  const head = root.querySelector('.vf-notehead text')
  if (top === undefined || second === undefined || bottom === undefined || !head) {
    throw new Error('staff or notehead not rendered')
  }
  const halfSpace = (second - top) / 2
  return Math.round((bottom - Number(head.getAttribute('y'))) / halfSpace)
}

async function rendered(root: Element) {
  await vi.waitFor(() => expect(root.querySelector('.vf-notehead')).not.toBeNull())
}

describe('StaffView', () => {
  it('draws one staff with a treble clef, 4/4 time and one note', async () => {
    const { element } = render(questionOn('C'))
    await rendered(element)

    expect(all(element, 'svg')).toHaveLength(1)
    expect(all(element, '.vf-stave')).toHaveLength(1)
    expect(staffLineYs(element)).toHaveLength(5)
    expect(glyphs(element, '.vf-clef')).toEqual([GLYPH.gClef])
    expect(glyphs(element, '.vf-timesignature')).toEqual([GLYPH.timeSig4, GLYPH.timeSig4])
    expect(all(element, '.vf-stavenote')).toHaveLength(1)
  })

  it('draws the note as a whole note', async () => {
    const { element } = render(questionOn('C'))
    await rendered(element)

    expect(glyphs(element, '.vf-notehead')).toEqual([GLYPH.noteheadWhole])
  })

  it('places C4 one ledger line below the staff', async () => {
    const { element } = render(questionOn('C'))
    await rendered(element)

    expect(noteStepAboveBottomLine(element)).toBe(-2)
  })

  it('places G4 on the second line', async () => {
    const { element } = render(questionOn('G'))
    await rendered(element)

    expect(noteStepAboveBottomLine(element)).toBe(2)
  })

  it('places C5 in the third space', async () => {
    const { element } = render(questionOn('C', 5))
    await rendered(element)

    expect(noteStepAboveBottomLine(element)).toBe(5)
  })

  it('redraws in place when the question changes', async () => {
    const view = render(questionOn('C'))
    await rendered(view.element)

    await view.setProps({ question: questionOn('G') })

    await vi.waitFor(() => expect(noteStepAboveBottomLine(view.element)).toBe(2))
    expect(all(view.element, 'svg')).toHaveLength(1)
    expect(all(view.element, '.vf-stave')).toHaveLength(1)
    expect(all(view.element, '.vf-stavenote')).toHaveLength(1)
  })

  // Полная проверка ширины 360 px без горизонтальной прокрутки — в e2e экрана
  // тренажёра: в jsdom нет раскладки. Здесь — что рисунок масштабируется и не
  // объявляет себя шире 360 px.
  it('renders a scalable drawing that fits a 360 px screen', async () => {
    const { element } = render(questionOn('C'))
    await rendered(element)

    const svg = element.querySelector('svg')
    const viewBox = svg
      ?.getAttribute('viewBox')
      ?.split(/[\s,]+/)
      .map(Number)
    expect(viewBox).toHaveLength(4)
    // Ширина в процентах или без атрибута тянется по контейнеру; в пикселях — не больше 360.
    const width = svg?.getAttribute('width') ?? ''
    const fixedPixelWidth = /^[\d.]+(px)?$/.test(width) ? Number.parseFloat(width) : 0
    expect(fixedPixelWidth).toBeLessThanOrEqual(360)

    const rightmost = Math.max(
      ...all(element, '.vf-stave path, .vf-stavebarline rect').map((shape) => {
        const box = shape
          .getAttribute('d')
          ?.match(/[\d.]+/g)
          ?.map(Number) ?? [Number(shape.getAttribute('x')) + Number(shape.getAttribute('width'))]
        return Math.max(...box.filter((_, index) => index % 2 === 0))
      }),
    )
    const [minX = 0, , viewWidth = 0] = viewBox ?? []
    expect(rightmost).toBeLessThanOrEqual(minX + viewWidth)
  })
})

// Отношение ширины к высоте из viewBox нарисованного SVG.
function drawnRatio(root: Element): number {
  const [, , width = 0, height = 0] =
    root
      .querySelector('svg')
      ?.getAttribute('viewBox')
      ?.split(/[\s,]+/)
      .map(Number) ?? []
  return width / height
}

// Зарезервированная пропорция корневого элемента: «12 / 5», «12/5» или «2.4».
function reservedRatio(root: Element): number {
  const value = getComputedStyle(root).aspectRatio
  const [width, height = 1] = value.split('/').map((part) => Number.parseFloat(part))
  return Number(width) / height
}

describe('StaffView space before the staff is drawn', () => {
  // В jsdom нет раскладки, высоту не измерить. Рисунок тянется по ширине
  // контейнера, поэтому его высота пропорциональна ширине. Место такой же высоты
  // при любой ширине экрана резервирует только пропорция, совпадающая с рисунком:
  // фиксированная min-height совпала бы лишь на одной ширине. Поэтому проверяется
  // вычисленный aspect-ratio корня, а не способ его задать (атрибут style или класс).
  it('reserves the drawing height before VexFlow has loaded', async () => {
    const { element } = render(questionOn('C'))
    expect(element.querySelector('svg')).toBeNull()
    const before = reservedRatio(element)

    await rendered(element)

    expect(before).toBeCloseTo(drawnRatio(element), 3)
  })

  it('keeps the same reserved height after drawing', async () => {
    const view = render(questionOn('C'))
    const root = view.element
    const before = reservedRatio(root)

    await rendered(root)

    expect(view.element).toBe(root)
    expect(before).toBeGreaterThan(0)
    expect(reservedRatio(view.element)).toBe(before)
  })
})

// Доступное имя по aria-label или aria-labelledby. Библиотеки для дерева
// доступности в проекте нет, а этих двух источников достаточно для role="img".
function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim()
  }
  return element.getAttribute('aria-label')?.trim() ?? ''
}

function images(root: Element): Element[] {
  return [root, ...all(root, '*')].filter((node) => node.getAttribute('role') === 'img')
}

describe('StaffView for screen readers', () => {
  it('is one image named by the label it is given', async () => {
    const { element } = render(questionOn('C'), 'Music staff')
    await rendered(element)

    const found = images(element)
    expect(found).toHaveLength(1)
    expect(found.map(accessibleName)).toEqual(['Music staff'])
  })

  it('does not reveal the note in the image name', async () => {
    const { element } = render(questionOn('G'), 'Music staff')
    await rendered(element)

    const [image] = images(element)
    expect(image).toBeDefined()
    const name = accessibleName(image as Element)
    expect(name).toBe('Music staff')
    expect(name).not.toMatch(/\bG\b|G4|\bsol\b/i)
  })

  it('is named before the staff is drawn', () => {
    const { element } = render(questionOn('C'), 'Music staff')

    expect(element.querySelector('svg')).toBeNull()
    expect(images(element).map(accessibleName)).toEqual(['Music staff'])
  })

  it('hides the drawn glyphs from screen readers', async () => {
    const { element } = render(questionOn('C'))
    await rendered(element)

    expect(element.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('notation module', () => {
  it('exposes only the staff component', async () => {
    expect(Object.keys(await import('@/infrastructure/notation'))).toEqual(['StaffView'])
  })
})
