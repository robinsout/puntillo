import { onBeforeUnmount, onMounted } from 'vue'
import { shortcutOf, type Shortcut } from './shortcuts'

// Boxes and radio buttons take only Space, so letters and Enter stay shortcuts on them.
const TYPED_INTO = 'select, textarea, input:not([type="checkbox"], [type="radio"])'

function isLeftToBrowser(event: KeyboardEvent, shortcut: Shortcut): boolean {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return true
  // A control that handles the key itself, such as the piano keyboard with its arrows, claims it.
  if (event.defaultPrevented) return true
  if (document.querySelector('dialog[open]')) return true
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest(TYPED_INTO)) return true
  return shortcut.type === 'confirm' && !!target?.closest('button, a[href]')
}

export function useShortcuts(act: (shortcut: Shortcut) => void) {
  function onKeydown(event: KeyboardEvent) {
    const shortcut = shortcutOf(event.code)
    if (!shortcut || isLeftToBrowser(event, shortcut)) return
    event.preventDefault()
    act(shortcut)
  }

  onMounted(() => document.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
}
