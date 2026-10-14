import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import UiNavBar from '@/presentation/ui/UiNavBar.vue'

// Feature navigation-and-settings, slice 2, criteria 1 and 2: the navigation by sections, named by
// its label, one link with an icon above its label for each item in their order; the current one
// is told to screen readers as the current page. Its place on a phone and on a desktop is CSS,
// checked in e2e/navigation.spec.ts.

afterEach(cleanup)

const ITEMS = [
  { to: '/', label: 'Trainer', icon: 'trainer', current: false },
  { to: '/progress', label: 'Progress', icon: 'progress', current: false },
  { to: '/wiki', label: 'Wiki', icon: 'wiki', current: true },
  { to: '/settings', label: 'Settings', icon: 'settings', current: false },
] as const

async function renderNav() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  })
  await router.push('/wiki/keys')
  render(UiNavBar, {
    props: { label: 'Sections', items: ITEMS },
    global: { plugins: [router] },
  })
}

const nav = () => within(screen.getByRole('navigation', { name: 'Sections' }))

describe('UiNavBar', () => {
  it('is a navigation named by its label', async () => {
    await renderNav()

    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy()
  })

  it('has a link for each item, in their order, to its address', async () => {
    await renderNav()

    const links = nav().getAllByRole('link')
    expect(links.map((link) => link.textContent?.trim())).toEqual(ITEMS.map((item) => item.label))
    expect(links.map((link) => link.getAttribute('href'))).toEqual(ITEMS.map((item) => item.to))
  })

  it('names each link by its label alone, the icon hidden', async () => {
    await renderNav()

    for (const item of ITEMS) {
      const link = nav().getByRole('link', { name: item.label })
      const icon = link.querySelector('svg')
      if (!icon) throw new Error(`the link ${item.label} has no icon`)
      expect(icon.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('puts the icon before the label', async () => {
    await renderNav()

    const link = nav().getByRole('link', { name: 'Progress' })
    const icon = link.querySelector('svg')
    const label = within(link).getByText('Progress')
    expect(
      icon && icon.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  // The router marks /wiki active on /wiki/keys too; the mark follows the item, not the router.
  it('marks the current item alone as the current page', async () => {
    await renderNav()

    const current = nav()
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent?.trim())
    expect(current).toEqual(['Wiki'])
  })
})
