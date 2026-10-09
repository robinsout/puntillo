import { fireEvent } from '@testing-library/vue'

// jsdom has no showModal() and close(), and no Esc or backdrop for a dialog. This stands in for the
// browser as far as the tests need it: a modal dialog opens, takes the focus, and Esc cancels it.
// The browser does not give the focus back on close in every engine, so this does not either.

const modals = new Set<HTMLDialogElement>()

const FOCUSABLE = 'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])'

function focusFirstIn(dialog: HTMLDialogElement) {
  const candidates = [
    ...dialog.querySelectorAll<HTMLElement>('[autofocus]'),
    ...dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
  ]
  const target = candidates.find(
    (element) => !(element as HTMLButtonElement).disabled && !element.closest('[hidden]'),
  )
  target?.focus()
}

if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    if (this.open) throw new DOMException('The dialog is already open', 'InvalidStateError')
    if (!this.isConnected)
      throw new DOMException('The dialog is not connected', 'InvalidStateError')
    this.setAttribute('open', '')
    modals.add(this)
    focusFirstIn(this)
  }

  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, value?: string) {
    if (!this.open) return
    if (value !== undefined) this.returnValue = value
    this.removeAttribute('open')
    modals.delete(this)
    this.dispatchEvent(new Event('close'))
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const top = [...modals].at(-1)
    if (!top) return
    const proceed = top.dispatchEvent(new Event('cancel', { cancelable: true }))
    if (proceed) top.close()
  })
}

// A dialog left open by a test that failed halfway must not count as open in the next one.
export function forgetDialogs() {
  modals.clear()
}

export const isOpenAsModal = (dialog: HTMLElement) =>
  dialog instanceof HTMLDialogElement && dialog.open && modals.has(dialog)

export async function pressEscape() {
  await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
}

// A press on the backdrop reaches the dialog itself, outside its box. In jsdom every box is empty,
// so the point is outside it whatever the layout.
export async function pressOutside(dialog: HTMLElement) {
  await fireEvent.click(dialog, { clientX: 10_000, clientY: 10_000 })
}
