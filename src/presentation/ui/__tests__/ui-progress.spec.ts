import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/vue'
import UiProgress from '@/presentation/ui/UiProgress.vue'

// Feature design-system, slice 2, criteria 3 and 12: a bar of progress, as the session bar shows
// the questions or the time passed. A progressbar named by its label, from 0 to its max; the value
// is given to screen readers by aria-valuenow, which the fill follows.

afterEach(cleanup)

function renderProgress(value: number, max: number, label = 'Question 3 of 10') {
  render(UiProgress, { props: { value, max, label } })
  return screen.getByRole('progressbar', { name: label })
}

describe('UiProgress', () => {
  it('is a progressbar named by its label', () => {
    expect(renderProgress(3, 10)).toBeTruthy()
  })

  it('runs from 0 to its max', () => {
    const bar = renderProgress(3, 10)

    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('10')
  })

  it.each([0, 3, 10])('gives the value %i', (value) => {
    const bar = renderProgress(value, 10)

    expect(bar.getAttribute('aria-valuenow')).toBe(String(value))
  })

  it('takes a max other than 10', () => {
    const bar = renderProgress(84, 180, 'Time: 1:24')

    expect(bar.getAttribute('aria-valuemax')).toBe('180')
    expect(bar.getAttribute('aria-valuenow')).toBe('84')
  })

  it('follows a new value', async () => {
    const { rerender } = render(UiProgress, { props: { value: 1, max: 10, label: 'Progress' } })

    await rerender({ value: 2, max: 10, label: 'Progress' })

    expect(
      screen.getByRole('progressbar', { name: 'Progress' }).getAttribute('aria-valuenow'),
    ).toBe('2')
  })
})
