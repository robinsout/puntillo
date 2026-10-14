import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { StaffView } from '@/infrastructure/notation'
import { createQuestion, type Question } from '@/domain/question'

// Feature navigation-and-settings, slice 4: the example on the card of a preset is drawn small,
// at a scale given in place of the one of the screen. The drawing is laid out as wide as the
// container divided by the scale, which the viewBox tells: jsdom lays nothing out, so the
// container counts as 360 px wide. Without a scale given, the screen decides as before: 1 on a
// wide screen, 0.8 on a phone narrower than 480 px.

const G4: Question = createQuestion({
  pitch: { letter: 'G', octave: 4 },
  duration: { value: 'half' },
})

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

function render(props: { drawingScale?: number } = {}) {
  wrapper = mount(StaffView, {
    props: { question: G4, label: 'Example', ...props },
    attachTo: document.body,
  })
  return wrapper.element
}

async function drawnWidth(root: Element): Promise<number> {
  await vi.waitFor(() => expect(root.querySelector('.vf-notehead')).not.toBeNull())
  const viewBox = root
    .querySelector('svg')
    ?.getAttribute('viewBox')
    ?.split(/[\s,]+/)
  return Number(viewBox?.[2])
}

describe('StaffView drawing scale', () => {
  it('lays the drawing out at the scale given: 0.4 makes 360 px hold 900 units', async () => {
    expect(await drawnWidth(render({ drawingScale: 0.4 }))).toBeCloseTo(900)
  })

  it('takes the scale given over the one of a phone', async () => {
    vi.stubGlobal('innerWidth', 400)

    expect(await drawnWidth(render({ drawingScale: 0.4 }))).toBeCloseTo(900)
  })

  it('keeps the scale of a wide screen without one: 360 units', async () => {
    vi.stubGlobal('innerWidth', 1024)

    expect(await drawnWidth(render())).toBeCloseTo(360)
  })

  it('keeps the scale of a phone without one: 450 units', async () => {
    vi.stubGlobal('innerWidth', 400)

    expect(await drawnWidth(render())).toBeCloseTo(450)
  })

  it('reserves the space of the drawing at the scale given', async () => {
    const element = render({ drawingScale: 0.4 }) as HTMLElement

    await vi.waitFor(() => expect(element.style.aspectRatio.replace(/\s/g, '')).toBe('900/150'))
  })
})
