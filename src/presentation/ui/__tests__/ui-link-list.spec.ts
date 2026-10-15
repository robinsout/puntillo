import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import UiLinkList from '@/presentation/ui/UiLinkList.vue'

// Feature design-system, slice 6: a list of links, each a line as wide as the list, its label on
// the left and a chevron on the right, as the topics of the wiki and See also are. The chevron is
// for the eye only: the label alone names the link. The size of the lines is CSS, checked in
// e2e/wiki.spec.ts.

afterEach(cleanup)

const ITEMS = [
  { to: '/wiki/key-signatures', label: 'Key signatures' },
  { to: '/wiki/treble-staff', label: 'Notes on the treble staff' },
] as const

async function renderList() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  })
  await router.push('/wiki/accidentals')
  render(UiLinkList, { props: { items: ITEMS }, global: { plugins: [router] } })
  return router
}

const list = () => within(screen.getByRole('list'))
const links = () => list().getAllByRole('link')

describe('UiLinkList', () => {
  it('is a list with a link for each item, named by its label, in their order', async () => {
    await renderList()

    expect(list().getAllByRole('listitem')).toHaveLength(2)
    expect(links().map((link) => link.textContent?.trim())).toEqual([
      'Key signatures',
      'Notes on the treble staff',
    ])
    for (const { label } of ITEMS) expect(list().getByRole('link', { name: label })).toBeTruthy()
  })

  it('links each item to its address', async () => {
    await renderList()

    expect(links().map((link) => link.getAttribute('href'))).toEqual([
      '/wiki/key-signatures',
      '/wiki/treble-staff',
    ])
  })

  it('goes to the address of the link followed', async () => {
    const router = await renderList()

    await fireEvent.click(list().getByRole('link', { name: 'Notes on the treble staff' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/wiki/treble-staff'))
  })

  it('ends each link with a chevron for the eye only', async () => {
    await renderList()

    for (const link of links()) {
      const icons = link.querySelectorAll('svg')
      expect(icons).toHaveLength(1)
      const icon = icons[0] as SVGElement
      expect(icon.getAttribute('aria-hidden')).toBe('true')
      const label = within(link).getByText(link.textContent?.trim() ?? '')
      expect(label.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})
