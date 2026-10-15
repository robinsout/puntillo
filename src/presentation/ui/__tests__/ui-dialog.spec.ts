import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/vue'
import {
  forgetDialogs,
  isOpenAsModal,
  pressEscape,
  pressOutside,
} from '@/presentation/__tests__/dialog'
import UiDialog from '@/presentation/ui/UiDialog.vue'

// Feature design-system, slice 7, criteria 3 and 11: the dialog of the system, a native <dialog>
// opened modally with showModal(), so the browser traps the focus and Esc cancels it. It is named
// by its title, a heading h2; its content is the default slot, rendered only while open, and its
// buttons the slot actions, after the content. Open is a v-model: Esc and a press on the backdrop
// close it, and close tells of every closing. The variant center is a box in the middle, sheet a
// panel from the bottom of a phone and from the right of a wide screen; the places are CSS, checked
// in e2e/dialogs.spec.ts. Giving the focus back to the opener is the screen's: WebKit does not
// focus a pressed button, so the dialog cannot tell its opener.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TITLE = 'Keyboard shortcuts'

function renderDialog(props: Record<string, unknown> = {}, initial = false) {
  const open = ref(initial)
  let closings = 0
  const Host = defineComponent({
    setup: () => () => [
      h('button', { type: 'button', onClick: () => (open.value = true) }, 'Open'),
      h(
        UiDialog,
        {
          title: TITLE,
          open: open.value,
          'onUpdate:open': (value: boolean) => {
            open.value = value
          },
          onClose: () => (closings += 1),
          ...props,
        },
        {
          default: () => h('p', 'Note names: A S D F G H J'),
          actions: () =>
            h('button', { type: 'button', onClick: () => (open.value = false) }, 'Close'),
        },
      ),
    ],
  })
  render(Host)
  return { open, closings: () => closings }
}

const dialog = () => screen.getByRole('dialog', { name: TITLE })
const openDialog = () => fireEvent.click(screen.getByRole('button', { name: 'Open' }))

describe('UiDialog', () => {
  it('is not shown while closed, nor its content', () => {
    renderDialog()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Note names: A S D F G H J')).toBeNull()
  })

  it('opens as a modal dialog, the focus inside it', async () => {
    renderDialog()

    await openDialog()

    expect(isOpenAsModal(dialog())).toBe(true)
    expect(dialog().contains(document.activeElement)).toBe(true)
  })

  it('opens at once when mounted open', async () => {
    renderDialog({}, true)

    await expect.poll(() => isOpenAsModal(dialog())).toBe(true)
  })

  it('is named by its title, a heading of level 2', async () => {
    renderDialog()

    await openDialog()

    const heading = within(dialog()).getByRole('heading', { level: 2 })
    expect(heading.textContent?.trim()).toBe(TITLE)
    expect(dialog().getAttribute('aria-labelledby')).toBe(heading.id)
  })

  it('shows its content, then its actions', async () => {
    renderDialog()

    await openDialog()

    const content = within(dialog()).getByText('Note names: A S D F G H J')
    const close = within(dialog()).getByRole('button', { name: 'Close' })
    expect(content.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('closes with Esc, telling of it', async () => {
    const { open, closings } = renderDialog()
    await openDialog()

    await pressEscape()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(open.value).toBe(false)
    expect(closings()).toBe(1)
  })

  it('closes with a press on its backdrop, telling of it', async () => {
    const { open, closings } = renderDialog()
    await openDialog()

    await pressOutside(dialog())

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(open.value).toBe(false)
    expect(closings()).toBe(1)
  })

  it('stays open on a press inside it off the controls', async () => {
    renderDialog()
    await openDialog()

    await fireEvent.click(within(dialog()).getByText('Note names: A S D F G H J'))

    expect(isOpenAsModal(dialog())).toBe(true)
  })

  it('closes when its value is set to closed, telling of it', async () => {
    const { closings } = renderDialog()
    await openDialog()

    await fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(closings()).toBe(1)
  })

  it('opens again after closing', async () => {
    renderDialog()
    await openDialog()
    await pressEscape()

    await openDialog()

    expect(isOpenAsModal(dialog())).toBe(true)
  })

  it('passes other attributes, such as a description, to the dialog', async () => {
    renderDialog({ 'aria-describedby': 'shortcuts-text' })

    await openDialog()

    expect(dialog().getAttribute('aria-describedby')).toBe('shortcuts-text')
  })

  it.each([
    [{}, 'center'],
    [{ variant: 'center' }, 'center'],
    [{ variant: 'sheet' }, 'sheet'],
  ])('with %j is the dialog of the system in the variant %s', async (props, variant) => {
    renderDialog(props)

    await openDialog()

    expect([...dialog().classList]).toEqual(expect.arrayContaining(['ui-dialog', variant]))
  })
})
