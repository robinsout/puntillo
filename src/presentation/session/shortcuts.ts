import type { Letter } from '@/domain/pitch'
import type { Duration } from '@/domain/question'

export type Shortcut =
  | { type: 'name'; letter: Letter }
  | { type: 'black'; below: Letter }
  | { type: 'octave-down' }
  | { type: 'octave-up' }
  | { type: 'sharp' }
  | { type: 'flat' }
  | { type: 'duration'; value: Duration['value'] }
  | { type: 'dot' }
  | { type: 'confirm' }
  | { type: 'previous-note' }
  | { type: 'next-note' }
  | { type: 'step-up' }
  | { type: 'step-down' }
  | { type: 'natural' }

const NAME_KEYS: Record<string, Letter> = {
  KeyA: 'C',
  KeyS: 'D',
  KeyD: 'E',
  KeyF: 'F',
  KeyG: 'G',
  KeyH: 'A',
  KeyJ: 'B',
}

// By their place from the whole note, whichever durations the row offers.
const DURATION_KEYS: Record<string, Duration['value']> = Object.fromEntries(
  (['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as const).flatMap((value, index) => [
    [`Digit${index + 1}`, value],
    [`Numpad${index + 1}`, value],
  ]),
)

const OTHER_KEYS: Record<string, Shortcut> = {
  Equal: { type: 'sharp' },
  Minus: { type: 'flat' },
  NumpadSubtract: { type: 'flat' },
  Period: { type: 'dot' },
  NumpadDecimal: { type: 'dot' },
  Enter: { type: 'confirm' },
  NumpadEnter: { type: 'confirm' },
  ArrowLeft: { type: 'previous-note' },
  ArrowRight: { type: 'next-note' },
  ArrowUp: { type: 'step-up' },
  ArrowDown: { type: 'step-down' },
  Digit0: { type: 'natural' },
  Numpad0: { type: 'natural' },
  KeyW: { type: 'black', below: 'C' },
  KeyE: { type: 'black', below: 'D' },
  KeyT: { type: 'black', below: 'F' },
  KeyY: { type: 'black', below: 'G' },
  KeyU: { type: 'black', below: 'A' },
  KeyZ: { type: 'octave-down' },
  KeyX: { type: 'octave-up' },
}

// Codes name the place of a key, not its character, so the keys stay put in any layout.
export function shortcutOf(code: string): Shortcut | null {
  const letter = NAME_KEYS[code]
  if (letter) return { type: 'name', letter }
  const value = DURATION_KEYS[code]
  if (value) return { type: 'duration', value }
  return OTHER_KEYS[code] ?? null
}

// What a key shows on its button, and its name for aria-keyshortcuts.
export interface ShortcutKey {
  readonly caption: string
  readonly name: string
}

const SYMBOL_KEYS: Record<string, ShortcutKey> = {
  Equal: { caption: '=', name: '=' },
  Minus: { caption: '−', name: '-' },
  Period: { caption: '.', name: '.' },
  ArrowUp: { caption: '↑', name: 'ArrowUp' },
  ArrowDown: { caption: '↓', name: 'ArrowDown' },
}

// The main block comes before the numeric keypad, so a key is told by its place there.
const CODES = [...Object.keys(NAME_KEYS), ...Object.keys(DURATION_KEYS), ...Object.keys(OTHER_KEYS)]

function keyOfCode(code: string): ShortcutKey | undefined {
  const character = /^(?:Key|Digit)(.)$/.exec(code)?.[1]
  return character ? { caption: character, name: character } : SYMBOL_KEYS[code]
}

const isSame = (one: Shortcut | null, other: Shortcut) =>
  JSON.stringify(one) === JSON.stringify(other)

export function shortcutKeyOf(shortcut: Shortcut): ShortcutKey | undefined {
  const code = CODES.find((each) => isSame(shortcutOf(each), shortcut))
  return code === undefined ? undefined : keyOfCode(code)
}
