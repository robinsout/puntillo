import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { cleanup, render, screen, within } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import UiAppBar from '@/presentation/ui/UiAppBar.vue'

// Feature navigation-and-settings, slice 2, criterion 3: the header of the app, its title a link
// home, then the navigation it holds in its slot.

afterEach(cleanup)

async function renderBar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  })
  await router.push('/progress')
  render(UiAppBar, {
    props: { title: 'Puntillo', to: '/' },
    slots: { default: () => h('nav', { 'aria-label': 'Sections' }, 'links') },
    global: { plugins: [router] },
  })
}

describe('UiAppBar', () => {
  it('is the banner of the page', async () => {
    await renderBar()

    expect(screen.getByRole('banner')).toBeTruthy()
  })

  it('has its title as a link to the address given', async () => {
    await renderBar()

    const title = within(screen.getByRole('banner')).getByRole('link', { name: 'Puntillo' })
    expect(title.getAttribute('href')).toBe('/')
  })

  it('holds its slot after the title', async () => {
    await renderBar()

    const banner = screen.getByRole('banner')
    const title = within(banner).getByRole('link', { name: 'Puntillo' })
    const nav = within(banner).getByRole('navigation', { name: 'Sections' })
    expect(title.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
