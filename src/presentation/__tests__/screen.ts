import { defineComponent, h, nextTick, onMounted, watch, type PropType } from 'vue'
import { createPinia } from 'pinia'
import { fireEvent, render, screen } from '@testing-library/vue'
import type { Clock, Random, Scheduler } from '@/application/ports'
import type { Question } from '@/domain/question'
import { createAppI18n, type Locale } from '@/infrastructure/i18n'
import { SessionView } from '@/presentation/session'
import { clockKey, randomKey, schedulerKey } from '@/presentation/dependencies'

// The VexFlow adapter has its own tests; here only its boundary matters: the image label,
// the load-error event and the drawn event. data-pitch exposes the pitch the stub received.
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
    emitLoadError = () => emit('load-error')
    emitDrawn = () => emit('drawn')
    const drawn = () => {
      if (staffDrawing === 'immediate') emit('drawn')
    }
    onMounted(drawn)
    watch(() => props.question, drawn)
    return () => {
      const { letter, octave } = props.question.note.pitch
      return h('div', {
        role: 'img',
        'aria-label': props.label,
        'data-pitch': `${letter}${octave}`,
      })
    }
  },
})

export const NAMES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si']

export const constant = (value: number): Random => ({ next: () => value })

// The first note is one of eight C4–C5 by floor(next() × 8), each next one of the other
// seven by floor(next() × 7). A constant 0 alternates C4 (do), D4 (re), C4, D4…
export const startingOnC4 = () => constant(0)
// 4/8 → 5th of eight: G4 (sol).
export const startingOnG4 = () => constant(4 / 8)
// 7/8 → last of eight: C5.
export const startingOnC5 = () => constant(7 / 8)

// One fake time drives both the scheduler and the clock, so elapse() also lengthens answers.
export function createManualClock() {
  let now = 0
  const clock: Clock = { now: () => now }
  let tasks: { due: number; task: () => void }[] = []
  const scheduler: Scheduler = {
    schedule(ms, task) {
      const entry = { due: now + ms, task }
      tasks.push(entry)
      return () => {
        tasks = tasks.filter((other) => other !== entry)
      }
    },
  }
  return {
    scheduler,
    clock,
    pending: () => tasks.length,
    async elapse(ms: number) {
      now += ms
      const due = tasks.filter((entry) => entry.due <= now)
      tasks = tasks.filter((entry) => entry.due > now)
      for (const entry of due) entry.task()
      await nextTick()
    },
  }
}

export type ManualClock = ReturnType<typeof createManualClock>

export interface Dependencies {
  random?: Random
  scheduler?: Scheduler
  clock?: Clock
}

// Dependencies are optional to test how the screen handles missing ones.
export function renderSessionWith(
  { random, scheduler, clock }: Dependencies,
  locale: Locale = 'en',
  drawing: StaffDrawing = 'immediate',
) {
  staffDrawing = drawing
  const provide: Record<symbol, unknown> = {}
  if (random) provide[randomKey as symbol] = random
  if (scheduler) provide[schedulerKey as symbol] = scheduler
  if (clock) provide[clockKey as symbol] = clock
  render(SessionView, {
    global: {
      plugins: [createAppI18n(locale), createPinia()],
      stubs: { StaffView: StaffViewStub },
      provide,
    },
  })
}

// By default questions alternate C4 (do), D4 (re)…
export function renderSession(
  random: Random = startingOnC4(),
  clock: ManualClock = createManualClock(),
  locale: Locale = 'en',
  drawing: StaffDrawing = 'immediate',
) {
  renderSessionWith({ random, scheduler: clock.scheduler, clock: clock.clock }, locale, drawing)
  return clock
}

export async function chooseLength(name: string) {
  await fireEvent.click(screen.getByRole('button', { name }))
}
