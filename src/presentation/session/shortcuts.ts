import type { Letter } from '@/domain/pitch'
import type { Duration } from '@/domain/question'

export type Shortcut =
  | { type: 'name'; letter: Letter }
  | { type: 'sharp' }
  | { type: 'flat' }
  | { type: 'duration'; value: Duration['value'] }
  | { type: 'dot' }
  | { type: 'confirm' }
  | { type: 'previous-note' }
  | { type: 'next-note' }

const NAME_KEYS: Record<string, Letter> = {
  KeyA: 'C',
  KeyS: 'D',
  KeyD: 'E',
  KeyF: 'F',
  KeyG: 'G',
  KeyH: 'A',
  KeyJ: 'B',
}

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
}

// Codes name the place of a key, not its character, so the keys stay put in any layout.
export function shortcutOf(code: string): Shortcut | null {
  const letter = NAME_KEYS[code]
  if (letter) return { type: 'name', letter }
  const value = DURATION_KEYS[code]
  if (value) return { type: 'duration', value }
  return OTHER_KEYS[code] ?? null
}
