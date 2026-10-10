import { defineComponent, h, nextTick, onMounted, watch, type PropType } from 'vue'
import { createPinia } from 'pinia'
import { fireEvent, render, screen } from '@testing-library/vue'
import type { Clock, KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming, SeventhNote } from '@/domain/naming'
import type { Pitch } from '@/domain/pitch'
import { DURATION_VALUES, isNote } from '@/domain/question'
import type { Duration, NoteOrRest, Question } from '@/domain/question'
import { createAppI18n } from '@/infrastructure/i18n'
import type { StaffLayout } from '@/infrastructure/notation'
import { SessionView } from '@/presentation/session'
import { clockKey, preferencesKey, randomKey } from '@/presentation/dependencies'
// The choice screen holds the panel Customize, a <dialog> that jsdom cannot open by itself.
import './dialog'

// The VexFlow adapter has its own tests; here only its boundary matters: the image label,
// the load-error event and the drawn event with the places of the notes, all on one line here.
// data-pitch and data-duration expose the notes the stub received, separated by spaces: "C4" for
// one note, "C4 E4 G4" for three; data-time-signature the time signature, "4/4". data-elements
// lists the notes and the rests in their order: "C4/half rest/quarter D4/quarter". A dotted
// duration ends with a dot: "quarter.", "C4/half." An altered pitch has its sign after the letter:
// "F#5", "Bb4"; data-key-signature gives the key signature: "none", "1 sharp", "7 flat".
let emitLoadError: () => void = () => {
  throw new Error('staff is not rendered')
}
let emitDrawn: () => void = () => {
  throw new Error('staff is not rendered')
}

// 'immediate' stands for a loaded VexFlow: the note is drawn as soon as it is given.
// 'held' stands for a VexFlow still loading: the note is drawn only on drawStaff().
export type StaffDrawing = 'immediate' | 'held'
let staffDrawing: StaffDrawing = 'immediate'

export const failStaffLoading = () => emitLoadError()
export const drawStaff = () => emitDrawn()

export const StaffViewStub = defineComponent({
  props: {
    question: { type: Object as PropType<Question>, required: true },
    label: { type: String, required: true },
  },
  emits: ['load-error', 'drawn'],
  setup(props, { emit }) {
    // The notes and the rests spread evenly over one line of the staff, the notes as high as its
    // middle line.
    const layout = (): StaffLayout => {
      const { elements } = props.question
      const places = elements.map((element, index) => ({
        element,
        x: (index + 1) / (elements.length + 1),
        line: 0,
      }))
      return {
        notes: places
          .filter((place) => isNote(place.element))
          .map(({ x, line }) => ({ x, y: 0.5, line })),
        rests: places.filter((place) => !isNote(place.element)).map(({ x, line }) => ({ x, line })),
        lines: [{ top: 0, bottom: 1, left: 0 }],
      }
    }
    emitLoadError = () => emit('load-error')
    emitDrawn = () => emit('drawn', layout())
    const drawn = () => {
      if (staffDrawing === 'immediate') emit('drawn', layout())
    }
    onMounted(drawn)
    watch(() => props.question, drawn)
    const durationText = ({ value, dots }: Duration) => `${value}${dots ? '.' : ''}`
    const pitchText = ({ letter, octave, alteration }: Pitch) =>
      `${letter}${alteration === 1 ? '#' : alteration === -1 ? 'b' : ''}${octave}`
    const elementText = (element: NoteOrRest) =>
      `${isNote(element) ? pitchText(element.pitch) : 'rest'}/${durationText(element.duration)}`
    return () => {
      const { notes, elements, timeSignature, keySignature } = props.question
      return h('div', {
        role: 'img',
        'aria-label': props.label,
        'data-pitch': notes.map(({ pitch }) => pitchText(pitch)).join(' '),
        'data-duration': notes.map(({ duration }) => durationText(duration)).join(' '),
        'data-elements': elements.map(elementText).join(' '),
        'data-time-signature': `${timeSignature.beats}/${timeSignature.beatValue}`,
        'data-key-signature':
          keySignature.count === 0 ? 'none' : `${keySignature.count} ${keySignature.accidental}`,
      })
    }
  },
})

export const NAMES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si']

// The duration buttons are named by their fraction, the same in every language:
// docs/features/duration-fractions.md.
export const DURATION_NAMES = {
  whole: '1/1',
  half: '1/2',
  quarter: '1/4',
  eighth: '1/8',
  sixteenth: '1/16',
} as const satisfies Record<Duration['value'], string>

// Every duration, in the order of the row: from the whole note to the sixteenth.
export const ALL_DURATIONS: readonly string[] = Object.values(DURATION_NAMES)

// The row in Confident reading, where most tests run: from the whole note to the eighth.
export const DURATIONS: readonly string[] = ALL_DURATIONS.filter(
  (name) => name !== DURATION_NAMES.sixteenth,
)

const isDurationName = (name: string) => ALL_DURATIONS.includes(name)

// The toggles Dot, Sharp and Flat in every language: docs/features/multi-note-questions.md and
// docs/features/accidentals.md.
const TOGGLE_NAMES: readonly string[] = [
  'Dot',
  'Точка',
  'Puntillo',
  'Sharp',
  'Диез',
  'Sostenido',
  'Flat',
  'Бемоль',
  'Bemol',
]

// The note name buttons, the duration buttons and the toggles are the only toggle buttons; this
// takes the note name buttons that are not pressed, in their order.
export const unpressedNoteNameButtons = () =>
  screen.getAllByRole('button', {
    pressed: false,
    name: (name) => !isDurationName(name) && !TOGGLE_NAMES.includes(name),
  })

// The note on the staff, as the stub received it.
export function shownDurationValue(): Duration['value'] {
  const shown = document.querySelector('[data-duration]')?.getAttribute('data-duration')
  const value = DURATION_VALUES.find((candidate) => candidate === shown)
  if (!value) throw new Error('no note is drawn on the staff')
  return value
}

export async function chooseShownDuration() {
  const name = DURATION_NAMES[shownDurationValue()]
  await fireEvent.click(screen.getByRole('button', { name }))
}

export const constant = (value: number): Random => ({ next: () => value })

// Gives the values in turn, over and over: with two of them, the first picks every pitch and the
// second every duration.
export function cycle(...values: number[]): Random {
  let index = 0
  return {
    next() {
      const value = values[index % values.length]
      if (value === undefined) throw new Error('cycle needs at least one value')
      index += 1
      return value
    },
  }
}

// Unless a test chooses otherwise, the screen runs in Confident reading with one note in 4/4 (see
// preferencesFor): the first note is one of the twelve C4–G5 by floor(next() × 12), each next one
// of the other eleven by floor(next() × 11). A constant 0 alternates C4 (do), D4 (re), C4, D4…
// The duration is whole, half, quarter or eighth by floor(next() × 4), so a constant below
// 1/4 keeps whole notes.
export const startingOnC4 = () => constant(0)
// 4/12 → 5th of twelve: G4 (sol), then F4, G4…; half notes.
export const startingOnG4 = () => constant(4 / 12)
// 6/12 → 7th of twelve: B4 (si), on the 3rd line, then A4, B4…; quarter notes.
export const startingOnB4 = () => constant(6 / 12)
// 7/12 → 8th of twelve: C5, then B4, C5…; quarter notes.
export const startingOnC5 = () => constant(7 / 12)

// Answers are timed by the injected clock, so elapse() is the only way time passes.
export function createManualClock() {
  let now = 0
  const clock: Clock = { now: () => now }
  return {
    clock,
    async elapse(ms: number) {
      now += ms
      await nextTick()
    },
  }
}

export type ManualClock = ReturnType<typeof createManualClock>

// Survives an unmount, so a new render over it stands for a page reload.
export function createMemoryStorage(): KeyValueStorage {
  const entries = new Map<string, string>()
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value)
    },
    canSave: () => true,
  }
}

// What the storage port promises when the browser storage is unavailable.
export const unavailableStorage = (): KeyValueStorage => ({
  get: () => null,
  set: () => {},
  canSave: () => false,
})

// What the storage port promises when the browser storage is full: it reads, but the first
// write fails, and from then on it cannot save.
export function fullStorage(): KeyValueStorage {
  let failed = false
  return {
    get: () => null,
    set: () => {
      failed = true
    },
    canSave: () => !failed,
  }
}

// A storage as a previous visit left it after choosing the naming; the keys stay private.
export function storageWithNoteNaming(naming: NoteNaming, storage = createMemoryStorage()) {
  createPreferences(storage, ['en']).chooseNoteNaming(naming)
  return storage
}

export function storageWithSeventhNote(note: SeventhNote, storage = createMemoryStorage()) {
  createPreferences(storage, ['en']).chooseSeventhNote(note)
  return storage
}

export function storageWithPreset(preset: Preset, storage = createMemoryStorage()) {
  createPreferences(storage, ['en']).choosePreset(preset)
  return storage
}

// Confident reading as it was before questions of bars and key signatures: one note in 4/4, no
// key signature, the name and the duration asked. The card shows Modified, since the preset itself
// asks for a bar in 4/4 or 3/4 with up to two signs.
export function storageWithOneNoteReading(storage = createMemoryStorage()) {
  const preferences = createPreferences(storage, ['en'])
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  return storage
}

// Most tests answer one note, its duration as well as its name, so unless a storage is given they
// run in Confident reading with one note in 4/4 (see storageWithOneNoteReading); a new user starts
// in First steps.
export const preferencesFor = (
  browserLanguages: readonly string[] = ['en'],
  storage: KeyValueStorage = storageWithOneNoteReading(),
) => createPreferences(storage, browserLanguages)

export interface Dependencies {
  random?: Random
  clock?: Clock
  preferences?: Preferences
}

// Dependencies are optional to test how the screen handles missing ones. As main.ts does, the
// interface and the page language start from the preferences.
export function renderSessionWith(
  { random, clock, preferences }: Dependencies,
  drawing: StaffDrawing = 'immediate',
) {
  staffDrawing = drawing
  const provide: Record<symbol, unknown> = {}
  if (random) provide[randomKey as symbol] = random
  if (clock) provide[clockKey as symbol] = clock
  if (preferences) provide[preferencesKey as symbol] = preferences
  const locale = preferences?.language ?? 'en'
  document.documentElement.lang = locale
  // A mount that throws halfway leaves its markup behind, and cleanup() knows nothing of it.
  const container = document.body.appendChild(document.createElement('div'))
  try {
    return render(SessionView, {
      container,
      global: {
        plugins: [createAppI18n(locale), createPinia()],
        stubs: { StaffView: StaffViewStub },
        provide,
      },
    })
  } catch (error) {
    container.remove()
    throw error
  }
}

// By default questions alternate C4 (do), D4 (re)… The locale is the browser language; nothing
// is saved yet.
export function renderSession(
  random: Random = startingOnC4(),
  clock: ManualClock = createManualClock(),
  locale: Locale = 'en',
  drawing: StaffDrawing = 'immediate',
) {
  renderSessionWith({ random, clock: clock.clock, preferences: preferencesFor([locale]) }, drawing)
  return clock
}

// A page load: saved preferences are read from the storage, the browser languages are the
// fallback. Unmount the result before the next load.
export function loadSession(
  storage: KeyValueStorage,
  browserLanguages: readonly string[] = ['en'],
) {
  return renderSessionWith({
    random: startingOnC4(),
    clock: createManualClock().clock,
    preferences: preferencesFor(browserLanguages, storage),
  })
}

export async function chooseLength(name: string) {
  await fireEvent.click(screen.getByRole('button', { name }))
}
