import { defineComponent, h, nextTick, onMounted, watch, type PropType } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { fireEvent, render, screen, within } from '@testing-library/vue'
import type {
  Clock,
  KeyValueStorage,
  MidiInput,
  Random,
  Timer,
  WallClock,
  WikiLibrary,
} from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import { createProgress, type Progress } from '@/application/progress'
import type { KeySound } from '@/application/sound'
import type { Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming, SeventhNote } from '@/domain/naming'
import type { Pitch } from '@/domain/pitch'
import { DURATION_VALUES, isNote } from '@/domain/question'
import type { Duration, NoteOrRest, Question, WrittenNote } from '@/domain/question'
import type { SessionLength } from '@/domain/session'
import { createAppI18n } from '@/infrastructure/i18n'
import type { NoteMark, StaffGhost, StaffHeard, StaffLayout } from '@/infrastructure/notation'
import { SessionView } from '@/presentation/session'
import {
  clockKey,
  keySoundKey,
  midiInputKey,
  preferencesKey,
  progressKey,
  randomKey,
  timerKey,
  wikiLibraryKey,
} from '@/presentation/dependencies'
// The choice screen holds the panel Customize, a <dialog> that jsdom cannot open by itself.
import './dialog'
import { isMicrophoneLine } from './microphone'
import { fakeWikiLibrary } from './wiki-library'

// The VexFlow adapter has its own tests; here only its boundary matters: the image label,
// the load-error event and the drawn event with the places of the notes, all on one line here.
// data-pitch and data-duration expose the notes the stub received, separated by spaces: "C4" for
// one note, "C4 E4 G4" for three; data-time-signature the time signature, "4/4". data-elements
// lists the notes and the rests in their order: "C4/half rest/quarter D4/quarter". A dotted
// duration ends with a dot: "quarter.", "C4/half." An altered pitch has its sign after the letter:
// "F#5", "Bb4"; data-key-signature gives the key signature: "none", "1 sharp", "7 flat".
// data-signs gives the sign written before each note, "-" for none: "sharp - natural".
// Feature m2-write-notes: in Write notes the staff gets the written notes, one per note of the
// question, null for none; data-drawn gives the notes drawn, "-" for an empty place: "-" before
// the note is written, "G4" after. Without written notes it gives the notes of the question.
// data-drawn-durations gives their durations: "quarter", "half." for a dotted one, "head" for a
// written note without a duration yet, "-" for an empty place. data-drawn-signs gives the sign
// written before each of them, "-" for none or an empty place: "sharp - natural".
// Feature design-system, slice 3: once a question is checked the staff gets a mark for each note of
// the question and maybe a ghost, a head drawn in outline in its column. data-marks gives the marks,
// "-" for none: "correct wrong -"; data-ghosts the pitches of the ghosts, "-" for none: "- F4 -";
// data-ghost-marks the marks of the ghosts, "wrong" for an answer drawn in Read notes, "correct" for
// the right note drawn in Write notes. Without marks or ghosts the attribute is left out.
// Slice 5: a staff drawn without its time signature, as in a line of Most mistakes, gives "none" in
// data-time-signature.
// Feature heard-note-on-staff, slice 1: with the microphone the staff gets the note heard, its column
// (the index of a note of the question, rests aside) and its pitch or, beyond three ledger lines,
// the side of the staff. data-heard gives them: "0 D4", "2 F#4", "1 up", "0 down"; left out in
// silence.
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
    written: { type: Array as PropType<readonly (WrittenNote | null)[]>, required: false },
    marks: { type: Array as PropType<readonly (NoteMark | null)[]>, required: false },
    ghosts: { type: Array as PropType<readonly (StaffGhost | null)[]>, required: false },
    hideTimeSignature: { type: Boolean, required: false },
    heard: { type: Object as PropType<StaffHeard | null>, required: false },
  },
  emits: ['load-error', 'drawn'],
  setup(props, { emit }) {
    // The notes and the rests spread evenly over one line of the staff, the notes as high as its
    // middle line. The staff lines run from 0.3 down to 0.7 of the height, a step 0.05: E4 at 0.7,
    // G4 at 0.6, B4 at 0.5, C5 at 0.45, F5 at 0.3.
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
        lines: [{ top: 0, bottom: 1, left: 0, topLine: 0.3, bottomLine: 0.7 }],
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
      const drawnNotes = props.written ?? notes
      const drawn = drawnNotes.map((each) => (each ? pitchText(each.pitch) : '-'))
      const drawnDurations = drawnNotes.map((each) =>
        each ? (each.duration ? durationText(each.duration) : 'head') : '-',
      )
      const drawnSigns = drawnNotes.map((each) => each?.accidental ?? '-')
      return h('div', {
        role: 'img',
        'aria-label': props.label,
        'data-pitch': notes.map(({ pitch }) => pitchText(pitch)).join(' '),
        'data-drawn': drawn.join(' '),
        'data-drawn-durations': drawnDurations.join(' '),
        'data-drawn-signs': drawnSigns.join(' '),
        'data-duration': notes.map(({ duration }) => durationText(duration)).join(' '),
        'data-elements': elements.map(elementText).join(' '),
        'data-time-signature': props.hideTimeSignature
          ? 'none'
          : `${timeSignature.beats}/${timeSignature.beatValue}`,
        'data-signs': notes.map(({ accidental }) => accidental ?? '-').join(' '),
        'data-key-signature':
          keySignature.count === 0 ? 'none' : `${keySignature.count} ${keySignature.accidental}`,
        'data-marks': props.marks?.map((mark) => mark ?? '-').join(' '),
        'data-ghosts': props.ghosts
          ?.map((ghost) => (ghost ? pitchText(ghost.pitch) : '-'))
          .join(' '),
        'data-ghost-marks': props.ghosts?.map((ghost) => ghost?.mark ?? '-').join(' '),
        'data-heard': props.heard
          ? `${props.heard.column} ${'pitch' in props.heard ? pitchText(props.heard.pitch) : props.heard.beyond}`
          : undefined,
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

// The first value, then the other one ever after. Unlike a cycle, a value drawn now and then, as the
// review queue draws one on a mistake, shifts nothing.
export function startingWith(first: number, then: number): Random {
  let drawn = false
  return {
    next() {
      if (drawn) return then
      drawn = true
      return first
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

interface Subscription {
  readonly intervalMs: number
  readonly tick: () => void
  nextAt: number
}

// Answers are timed by the injected clock, so elapse() is the only way time passes. The timer
// that comes with it ticks by this clock: elapse() brings every tick due on the way, one per
// interval, as a visible tab does; elapseHidden() brings none, as a hidden tab holds the intervals
// back, so whatever is shown can change only on the next tick.
export function createManualClock() {
  let now = 0
  const subscriptions = new Set<Subscription>()
  const clock: Clock = { now: () => now }
  const timer: Timer = {
    every(intervalMs, tick) {
      if (intervalMs <= 0) throw new Error('a timer interval must be positive')
      const subscription: Subscription = { intervalMs, tick, nextAt: now + intervalMs }
      subscriptions.add(subscription)
      return () => {
        subscriptions.delete(subscription)
      }
    },
  }
  const nextDue = (end: number) =>
    [...subscriptions]
      .filter((subscription) => subscription.nextAt <= end)
      .sort((a, b) => a.nextAt - b.nextAt)[0]
  return {
    clock,
    timer,
    async elapse(ms: number) {
      const end = now + ms
      for (let due = nextDue(end); due; due = nextDue(end)) {
        now = due.nextAt
        due.nextAt += due.intervalMs
        due.tick()
        await nextTick()
      }
      now = end
      await nextTick()
    },
    async elapseHidden(ms: number) {
      now += ms
      for (const subscription of subscriptions) subscription.nextAt = now + subscription.intervalMs
      await nextTick()
    },
  }
}

export type ManualClock = ReturnType<typeof createManualClock>

// 13 Oct 2026, noon UTC, unless set: the progress takes the dates of its answers from it.
export function createManualWallClock(at = Date.UTC(2026, 9, 13, 12)) {
  let now = at
  const clock: WallClock = { now: () => now }
  return {
    clock,
    elapse(ms: number) {
      now += ms
    },
  }
}

// The progress of the page over the storage of its preferences, as main.ts makes it.
export const progressOver = (
  storage: KeyValueStorage,
  wallClock: WallClock = createManualWallClock().clock,
): Progress => createProgress(storage, wallClock)

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

export function storageWithSessionLength(
  length: SessionLength,
  storage = storageWithOneNoteReading(),
) {
  createPreferences(storage, ['en']).chooseSessionLength(length)
  return storage
}

// Feature navigation-and-settings: the boxes of the quick mode and of the answer at once are set on
// the settings screen only, so a session that needs one ticked starts from a storage that holds it.
export function storageWithQuickMode(storage = storageWithOneNoteReading()) {
  createPreferences(storage, ['en']).chooseAutoAdvance(true)
  return storage
}

export function storageWithAnswerAtOnce(storage = storageWithOneNoteReading()) {
  createPreferences(storage, ['en']).chooseShowAnswerAtOnce(true)
  return storage
}

// Confident reading as it was before questions of bars, key signatures and accidentals: one note
// in 4/4, no key signature, no accidentals, the name and the duration asked. The card shows
// Modified, since the preset itself asks for a bar in 4/4 or 3/4 with up to two signs and with
// sharps and flats.
export function storageWithOneNoteReading(storage = createMemoryStorage()) {
  const preferences = createPreferences(storage, ['en'])
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'none' })
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
  // Without one, a timer that never ticks: only a session on time needs it to tick.
  timer?: Timer
  preferences?: Preferences
  library?: WikiLibrary
  // Without one, a progress over a storage of its own.
  progress?: Progress
  // Without one, none is provided: the keys are silent.
  keySound?: KeySound
  // Without one, none is provided: no instrument is heard.
  midiInput?: MidiInput
  // Others, by their injection keys.
  provides?: Readonly<Record<symbol, unknown>>
}

// The choice screen links to the wiki; here the links only need to resolve. The wiki itself is
// rendered through the routes of the app by renderApp in ./app.
const linksOnlyRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:path(.*)*', component: { render: () => null } }],
  })

// Dependencies are optional to test how the screen handles missing ones, but for the wiki library,
// which the hints of the review load from: a fake one unless given. As main.ts does, the interface
// and the page language start from the preferences.
export function renderSessionWith(
  {
    random,
    clock,
    timer = createManualClock().timer,
    preferences,
    library = fakeWikiLibrary().library,
    progress = progressOver(createMemoryStorage()),
    keySound,
    midiInput,
    provides = {},
  }: Dependencies,
  drawing: StaffDrawing = 'immediate',
) {
  staffDrawing = drawing
  const provide: Record<symbol, unknown> = { ...provides }
  if (random) provide[randomKey as symbol] = random
  if (clock) provide[clockKey as symbol] = clock
  if (preferences) provide[preferencesKey as symbol] = preferences
  provide[timerKey as symbol] = timer
  provide[wikiLibraryKey as symbol] = library
  provide[progressKey as symbol] = progress
  if (keySound) provide[keySoundKey as symbol] = keySound
  if (midiInput) provide[midiInputKey as symbol] = midiInput
  const locale = preferences?.language ?? 'en'
  document.documentElement.lang = locale
  // A mount that throws halfway leaves its markup behind, and cleanup() knows nothing of it.
  const container = document.body.appendChild(document.createElement('div'))
  try {
    return render(SessionView, {
      container,
      global: {
        plugins: [createAppI18n(locale), createPinia(), linksOnlyRouter()],
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
  renderSessionWith(
    { random, clock: clock.clock, timer: clock.timer, preferences: preferencesFor([locale]) },
    drawing,
  )
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
    progress: progressOver(storage),
  })
}

// The text of the status message as read: feature wiki, slice 3, puts a button Why? after each
// sentence of a review, which is no part of the message. Feature microphone-input, slice 4: the
// line of the state of the microphone is a status too, and no part of the message either.
export function statusText(): string {
  const messages = screen
    .getAllByRole('status')
    .filter((status) => !isMicrophoneLine(status.textContent?.replace(/\s+/g, ' ').trim() ?? ''))
  if (messages.length !== 1)
    throw new Error(`One status message expected, ${messages.length} found`)
  const copy = (messages[0] as HTMLElement).cloneNode(true) as HTMLElement
  for (const button of copy.querySelectorAll('button')) button.remove()
  return copy.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

// Feature design-system, slice 2: the bar at the top of a session. A counted session names its
// progress bar by the question number, "Question 1 of 10", and a session on time by the time
// passed, "Time: 1:24"; without a limit there is no bar and "Question 7" is shown as text. Under
// it stands the accuracy by the points, rounded as in the results, and the streak.
export const queryProgressBar = (name: string | RegExp) =>
  screen.queryByRole('progressbar', { name })

export const accuracyText = (points: number, maxPoints: number) =>
  maxPoints === 0 ? 'Accuracy —' : `Accuracy ${Math.round((points * 100) / maxPoints)}%`

// Feature design-system, slice 5: the results show the accuracy large, "85%", with its points beside
// it, "17 of 20 points"; this gives both as one text, "85% · 17 of 20 points", null without either.
// The default normalizer would turn the non-breaking space of "85 %" into a plain one.
const PERCENT = /^\d+\u00A0?%$/
const POINTS = /^\d+ (of|из|de) \d+ \p{L}+$/u
const trimmed = { normalizer: (raw: string) => raw.trim() }

export function resultAccuracy(): string | null {
  const [percent, points] = [PERCENT, POINTS].map((text) =>
    screen.queryByText(text, trimmed)?.textContent?.trim(),
  )
  return percent || points ? `${percent ?? '—'} · ${points ?? '—'}` : null
}

// The other figures are a list of terms, each with its value: { Questions: '10', ... }.
export function resultStats(): Record<string, string> {
  const text = (element: HTMLElement | undefined) => element?.textContent?.trim() ?? ''
  const definitions = screen.queryAllByRole('definition')
  return Object.fromEntries(
    screen.queryAllByRole('term').map((term, index) => [text(term), text(definitions[index])]),
  )
}

export const resultStat = (label: string): string | undefined => resultStats()[label]

// A line of Most mistakes gives the item in bold and its count below it, apart from its staff,
// drawn for the eye only, and its links: "do4, whole note / 1 mistake".
export function mistakeLine(item: HTMLElement): string {
  const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT)
  const texts: string[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('a, [role="link"], [role="img"], [aria-hidden="true"]'))
      continue
    const text = node.textContent?.replace(/\s+/g, ' ').trim()
    if (text) texts.push(text)
  }
  return texts.join(' / ')
}

// Feature navigation-and-settings, slice 3: the lengths are one choice of radio buttons on the
// start screen. A press on a length only chooses it; Start begins the session, in the language of
// the page.
const LENGTH_GROUP = /^(Session length|Длина сессии|Duración de la sesión)$/
const START = /^(Start|Начать|Empezar)$/

export const lengthGroup = () => screen.getByRole('radiogroup', { name: LENGTH_GROUP })
export const lengthOptions = () => within(lengthGroup()).getAllByRole<HTMLInputElement>('radio')
export const lengthOption = (name: string) =>
  within(lengthGroup()).getByRole<HTMLInputElement>('radio', { name })
export const startButton = () => screen.getByRole<HTMLButtonElement>('button', { name: START })

export async function chooseLength(name: string) {
  await fireEvent.click(lengthOption(name))
}

export async function startSession(length: string) {
  await chooseLength(length)
  await fireEvent.click(startButton())
}
