import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, type VNodeChild } from 'vue'
import { cleanup, render, screen } from '@testing-library/vue'
import UiStat from '@/presentation/ui/UiStat.vue'

// Feature design-system, slice 5, criterion 16: a figure of the results, a tile with its label
// small and its value large. Tiles stand in a list of descriptions, <dl>, each a term, the label,
// with its definition, the value; the value is given as a prop or, marked up, in the slot.

afterEach(cleanup)

type Stat = { label: string; value?: string | number; slot?: () => VNodeChild }

function renderStats(...stats: Stat[]) {
  render(
    defineComponent({
      setup: () => () =>
        h(
          'dl',
          stats.map(({ label, value, slot }) =>
            h(UiStat, { label, value }, slot ? { default: slot } : undefined),
          ),
        ),
    }),
  )
}

const text = (element: HTMLElement) => element.textContent?.trim()
const terms = () => screen.getAllByRole('term').map(text)
const definitions = () => screen.getAllByRole('definition').map(text)

describe('UiStat', () => {
  it('is a term, its label, with its definition, its value', () => {
    renderStats({ label: 'Questions', value: '10' })

    expect(terms()).toEqual(['Questions'])
    expect(definitions()).toEqual(['10'])
  })

  it('gives the label before the value', () => {
    renderStats({ label: 'Questions', value: '10' })

    const [term] = screen.getAllByRole('term')
    const [definition] = screen.getAllByRole('definition')
    expect(
      (term as HTMLElement).compareDocumentPosition(definition as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('takes a number for its value', () => {
    renderStats({ label: 'Best streak', value: 0 })

    expect(definitions()).toEqual(['0'])
  })

  it('takes its value from the slot', () => {
    renderStats({
      label: 'Average time',
      slot: () => ['2.4', h('abbr', { title: 'seconds' }, 's')],
    })

    expect(definitions()).toEqual(['2.4s'])
    expect(screen.getByTitle('seconds')).toBeTruthy()
  })

  it('pairs each label with its own value in a list of several', () => {
    renderStats(
      { label: 'Questions', value: '10' },
      { label: 'Best streak', value: '5' },
      { label: 'Average time', value: '2.4 s' },
    )

    expect(terms()).toEqual(['Questions', 'Best streak', 'Average time'])
    expect(definitions()).toEqual(['10', '5', '2.4 s'])
  })
})
