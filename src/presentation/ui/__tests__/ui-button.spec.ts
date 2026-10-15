import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import UiButton from '@/presentation/ui/UiButton.vue'

// Feature navigation-and-settings, slice 3: the button of the design system, as Start is. Its
// content is the slot; a button of a form is of type button unless given, so that it never sends
// one.
//
// Feature design-system, slice 7: given a place to go, it is a link that looks like the button, as
// Read the article in a hint is; it still tells of a press, so the screen can close the hint.

afterEach(cleanup)

function renderButton(props: Record<string, unknown> = {}) {
  let presses = 0
  const Host = defineComponent({
    setup: () => () =>
      h('form', { onSubmit: (event: Event) => event.preventDefault() }, [
        h(UiButton, { ...props, onClick: () => (presses += 1) }, { default: () => 'Start' }),
      ]),
  })
  render(Host)
  return { presses: () => presses }
}

const button = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Start' })

describe('UiButton', () => {
  it('is a button named by its content', () => {
    renderButton()

    expect(button()).toBeTruthy()
  })

  it('is of type button unless given', () => {
    renderButton()

    expect(button().type).toBe('button')
  })

  it('takes the type given', () => {
    renderButton({ type: 'submit' })

    expect(button().type).toBe('submit')
  })

  it('tells of a press', async () => {
    const { presses } = renderButton()

    await fireEvent.click(button())

    expect(presses()).toBe(1)
  })

  it('is enabled unless disabled', () => {
    renderButton()

    expect(button().disabled).toBe(false)
  })

  it('cannot be pressed when disabled', async () => {
    const { presses } = renderButton({ disabled: true })

    expect(button().disabled).toBe(true)
    await fireEvent.click(button())
    expect(presses()).toBe(0)
  })
})

describe('UiButton with a place to go', () => {
  async function renderLink(props: Record<string, unknown> = {}) {
    let presses = 0
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
    })
    await router.push('/')
    render(UiButton, {
      props: { to: '/wiki/treble-staff', onClick: () => (presses += 1), ...props },
      slots: { default: 'Read the article' },
      global: { plugins: [router] },
    })
    return { router, presses: () => presses }
  }

  const link = () => screen.getByRole<HTMLAnchorElement>('link', { name: 'Read the article' })

  it('is a link named by its content to that place, not a button', async () => {
    await renderLink()

    expect(link().getAttribute('href')).toBe('/wiki/treble-staff')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each([
    [{}, 'secondary'],
    [{ variant: 'primary' }, 'primary'],
  ])('with %j looks like the button %s', async (props, variant) => {
    await renderLink(props)

    expect([...link().classList]).toEqual(expect.arrayContaining(['ui-button', variant]))
  })

  it('goes there on a press, telling of it', async () => {
    const { router, presses } = await renderLink()

    await fireEvent.click(link())

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/wiki/treble-staff'))
    expect(presses()).toBe(1)
  })
})
