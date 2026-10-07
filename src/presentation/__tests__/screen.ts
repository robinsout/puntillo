import { defineComponent, h, nextTick, type PropType } from 'vue'
import { createPinia } from 'pinia'
import { fireEvent, render, screen } from '@testing-library/vue'
import type { Random, Scheduler } from '@/application/ports'
import type { Question } from '@/domain/question'
import { createAppI18n, type Locale } from '@/infrastructure/i18n'
import { SessionView } from '@/presentation/session'
import { randomKey, schedulerKey } from '@/presentation/dependencies'

// Общая обвязка компонентных тестов экрана: заглушка нотоносца, источник
// случайности, ручной планировщик и рендер корневого экрана сессии.

// Нотоносец подменяется заглушкой: адаптер VexFlow проверен своими тестами,
// а здесь важна граница — подпись изображения и событие отказа загрузки.
// Заглушка рисует то же доступное изображение, умеет сообщить об отказе
// и показывает в data-pitch высоту ноты, которую получила в вопросе.
let emitLoadError: () => void = () => {
  throw new Error('staff is not rendered')
}

export const failStaffLoading = () => emitLoadError()

export const StaffViewStub = defineComponent({
  props: {
    question: { type: Object as PropType<Question>, required: true },
    label: { type: String, required: true },
  },
  emits: ['load-error'],
  setup(props, { emit }) {
    emitLoadError = () => emit('load-error')
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

// Источник случайности, всегда возвращающий одно значение.
export const constant = (value: number): Random => ({ next: () => value })

// Генератор берёт первую ноту из восьми C4–C5 по floor(next() × 8), каждую
// следующую — из семи без предыдущей по floor(next() × 7).
// При постоянном 0 вопросы чередуются: C4 (do), D4 (re), C4, D4…
export const startingOnC4 = () => constant(0)
// 4/8 → пятая из восьми: G4 (sol).
export const startingOnG4 = () => constant(4 / 8)
// 7/8 → последняя из восьми: C5 (do второй октавы).
export const startingOnC5 = () => constant(7 / 8)

// Планировщик с ручным временем: задачи запускаются только по elapse(ms),
// отменённые не запускаются. Реальные таймеры в тестах экрана не нужны.
export function createManualClock() {
  let now = 0
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
}

// Корневой экран без обвязки: для проверок отсутствующих зависимостей.
export function renderSessionWith({ random, scheduler }: Dependencies, locale: Locale = 'en') {
  const provide: Record<symbol, unknown> = {}
  if (random) provide[randomKey as symbol] = random
  if (scheduler) provide[schedulerKey as symbol] = scheduler
  render(SessionView, {
    global: {
      plugins: [createAppI18n(locale), createPinia()],
      stubs: { StaffView: StaffViewStub },
      provide,
    },
  })
}

// Открывает корневой экран: на нём выбор длины сессии.
// По умолчанию вопросы чередуются C4 (do), D4 (re)…
export function renderSession(
  random: Random = startingOnC4(),
  clock: ManualClock = createManualClock(),
  locale: Locale = 'en',
) {
  renderSessionWith({ random, scheduler: clock.scheduler }, locale)
  return clock
}

// Нажимает кнопку длины на экране выбора: «10», «20», «50» или «No limit» на языке экрана.
export async function chooseLength(name: string) {
  await fireEvent.click(screen.getByRole('button', { name }))
}
