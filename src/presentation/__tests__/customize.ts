import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import type { Locale } from '@/domain/language'
import type { Duration } from '@/domain/question'
import { forgetDialogs } from './dialog'
import {
  constant,
  createManualClock,
  createMemoryStorage,
  loadSession,
  preferencesFor,
  renderSessionWith,
  type StaffDrawing,
} from './screen'

// The choice screen with the panel Customize, feature difficulty-presets, slices 3 and 4.

// A duration box is named by the duration and its fraction, as on the button of the trainer:
// docs/features/duration-fractions.md, criterion 3.
export const DURATION_BOX_NAMES = {
  en: {
    whole: 'Whole note 1/1',
    half: 'Half note 1/2',
    quarter: 'Quarter note 1/4',
    eighth: 'Eighth note 1/8',
    sixteenth: 'Sixteenth note 1/16',
  },
  ru: {
    whole: 'Целая 1/1',
    half: 'Половинная 1/2',
    quarter: 'Четверть 1/4',
    eighth: 'Восьмая 1/8',
    sixteenth: 'Шестнадцатая 1/16',
  },
  es: {
    whole: 'Redonda 1/1',
    half: 'Blanca 1/2',
    quarter: 'Negra 1/4',
    eighth: 'Corchea 1/8',
    sixteenth: 'Semicorchea 1/16',
  },
} as const satisfies Record<Locale, Record<Duration['value'], string>>

export const PRESET_NAMES = ['First steps', 'Confident reading', 'Advanced']

export const button = (name: string) => screen.getByRole('button', { name })
export const queryButton = (name: string) => screen.queryByRole('button', { name })
export const panel = (name = 'Customize') => screen.getByRole('dialog', { name })
export const inPanel = (name = 'Customize') => within(panel(name))

export interface Visit {
  random?: Random
  locale?: Locale
  storage?: KeyValueStorage
  drawing?: StaffDrawing
}

// A new user, First steps: C4–C5 without ledger lines, the notes D4–C5, half and quarter notes.
// A constant 0 picks the lowest of the notes, D4, and the first of the durations, for the example
// and for the first question alike.
export function renderChoice({
  random = constant(0),
  locale = 'en',
  storage = createMemoryStorage(),
  drawing = 'immediate',
}: Visit = {}) {
  renderSessionWith(
    { random, clock: createManualClock().clock, preferences: preferencesFor([locale], storage) },
    drawing,
  )
  return storage
}

export async function openPanel(texts: { customize: string } = { customize: 'Customize' }) {
  await fireEvent.click(button(texts.customize))
  return panel(texts.customize)
}

export async function closePanel() {
  await fireEvent.click(inPanel().getByRole('button', { name: 'Done' }))
}

export function reload(storage: KeyValueStorage) {
  cleanup()
  forgetDialogs()
  loadSession(storage)
}

// The mark reaches a screen reader as the description of the card, not only the eye.
export const modifiedCards = () =>
  PRESET_NAMES.filter(
    (name) => screen.queryByRole('button', { name, description: 'Modified' }) !== null,
  )
