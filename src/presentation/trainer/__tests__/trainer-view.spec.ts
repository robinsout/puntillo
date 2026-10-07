import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, type PropType } from 'vue'
import { createPinia } from 'pinia'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue'
import type { Random, Scheduler } from '@/application/ports'
import type { Question } from '@/domain/question'
import { createAppI18n } from '@/infrastructure/i18n'
import { randomKey, schedulerKey, TrainerView } from '@/presentation/trainer'

// Нотоносец подменяется заглушкой: адаптер VexFlow проверен своими тестами,
// а здесь важна граница — подпись изображения и событие отказа загрузки.
// Заглушка рисует то же доступное изображение, умеет сообщить об отказе
// и показывает в data-pitch высоту ноты, которую получила в вопросе.
let failStaffLoading: () => void = () => {
  throw new Error('staff is not rendered')
}

const StaffViewStub = defineComponent({
  props: {
    question: { type: Object as PropType<Question>, required: true },
    label: { type: String, required: true },
  },
  emits: ['load-error'],
  setup(props, { emit }) {
    failStaffLoading = () => emit('load-error')
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

// Глобальных хуков Vitest нет, поэтому Testing Library не убирает экран сама.
afterEach(cleanup)

const NAMES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si']

// Источник случайности, всегда возвращающий одно значение.
const constant = (value: number): Random => ({ next: () => value })

// Генератор берёт первую ноту из восьми C4–C5 по floor(next() × 8), каждую
// следующую — из семи без предыдущей по floor(next() × 7).
// При постоянном 0 вопросы чередуются: C4 (do), D4 (re), C4, D4…
const startingOnC4 = () => constant(0)
// 4/8 → пятая из восьми: G4 (sol).
const startingOnG4 = () => constant(4 / 8)
// 7/8 → последняя из восьми: C5 (do второй октавы).
const startingOnC5 = () => constant(7 / 8)

// Планировщик с ручным временем: задачи запускаются только по elapse(ms),
// отменённые не запускаются. Реальные таймеры в тестах экрана не нужны.
function createManualClock() {
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

// По умолчанию экран открывается на C4: верный ответ do, после Next — D4 (re).
// Возвращает часы планировщика, внедрённого в экран.
function renderTrainer(random: Random = startingOnC4(), clock = createManualClock()) {
  render(TrainerView, {
    global: {
      plugins: [createAppI18n(), createPinia()],
      stubs: { StaffView: StaffViewStub },
      provide: { [randomKey as symbol]: random, [schedulerKey as symbol]: clock.scheduler },
    },
  })
  return clock
}

const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')

const nameButton = (name: string) => screen.getByRole('button', { name })
const checkButton = () => screen.getByRole('button', { name: 'Check' })
const queryCheck = () => screen.queryByRole('button', { name: 'Check' })
const queryNext = () => screen.queryByRole('button', { name: 'Next' })
const status = () => screen.queryByRole('status')
const queryResult = () => screen.queryByText(/^(Correct|Incorrect)$/)
const queryHint = () => screen.queryByText('Choose a note name first')
const autoNext = () =>
  screen.getByRole<HTMLInputElement>('checkbox', { name: 'Open next question automatically' })
const nextButton = () => screen.getByRole('button', { name: 'Next' })

const pressed = () =>
  NAMES.filter((name) => nameButton(name).getAttribute('aria-pressed') === 'true')
const disabled = () => NAMES.filter((name) => nameButton(name).matches(':disabled'))

async function answer(name: string) {
  await fireEvent.click(nameButton(name))
  await fireEvent.click(checkButton())
}

describe('TrainerView', () => {
  describe('on open', () => {
    it('shows the staff as an image named "Music staff"', () => {
      renderTrainer()

      expect(screen.getByRole('img', { name: 'Music staff' })).toBeTruthy()
    })

    it('shows seven note name buttons from do to si in order', () => {
      renderTrainer()

      const names = screen
        .getAllByRole('button')
        .map((button) => button.textContent?.trim())
        .filter((text) => text !== undefined && NAMES.includes(text))
      expect(names).toEqual(NAMES)
    })

    it('has no note name selected', () => {
      renderTrainer()

      for (const name of NAMES) {
        expect(nameButton(name).getAttribute('aria-pressed')).toBe('false')
      }
    })

    it('has the heading "Name the note"', () => {
      renderTrainer()

      expect(screen.getByRole('heading', { name: 'Name the note' })).toBeTruthy()
    })

    it('shows Check and no Next, result or hint', () => {
      renderTrainer()

      expect(queryCheck()).not.toBeNull()
      expect(queryNext()).toBeNull()
      expect(queryResult()).toBeNull()
      expect(queryHint()).toBeNull()
    })
  })

  describe('choosing a note name', () => {
    it('selects the pressed name only', async () => {
      renderTrainer()

      await fireEvent.click(nameButton('mi'))

      expect(pressed()).toEqual(['mi'])
    })

    it('moves the selection to another name', async () => {
      renderTrainer()

      await fireEvent.click(nameButton('mi'))
      await fireEvent.click(nameButton('la'))

      expect(pressed()).toEqual(['la'])
    })
  })

  describe('checking the answer', () => {
    it('says "Correct" in a status message for the right name', async () => {
      renderTrainer()

      await answer('do')

      expect(status()?.textContent).toContain('Correct')
      expect(status()?.textContent).not.toContain('Incorrect')
    })

    it('says "Incorrect" in a status message for a wrong name, without the right answer', async () => {
      renderTrainer()

      await answer('re')

      expect(status()?.textContent?.trim()).toBe('Incorrect')
      expect(status()?.textContent).not.toMatch(/\bdo\b/)
    })

    it('replaces Check with Next', async () => {
      renderTrainer()

      await answer('do')

      expect(queryCheck()).toBeNull()
      expect(queryNext()).not.toBeNull()
    })

    it('moves the keyboard focus to Next', async () => {
      renderTrainer()
      await fireEvent.click(nameButton('do'))
      checkButton().focus()

      await fireEvent.click(checkButton())

      await waitFor(() => expect(document.activeElement).toBe(queryNext()))
    })

    it('keeps the selection and the message when another name is pressed after the result', async () => {
      renderTrainer()
      await answer('re')

      await fireEvent.click(nameButton('do'))

      expect(pressed()).toEqual(['re'])
      expect(status()?.textContent?.trim()).toBe('Incorrect')
    })
  })

  describe('note name buttons after the result', () => {
    it('are all disabled after a right answer, the chosen one still pressed', async () => {
      renderTrainer()

      await answer('do')

      expect(disabled()).toEqual(NAMES)
      expect(pressed()).toEqual(['do'])
    })

    it('are all disabled after a wrong answer, the chosen one still pressed', async () => {
      renderTrainer()

      await answer('re')

      expect(disabled()).toEqual(NAMES)
      expect(pressed()).toEqual(['re'])
    })

    it('are all enabled and none pressed after Next', async () => {
      renderTrainer()
      await answer('re')

      await fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      expect(disabled()).toEqual([])
      expect(pressed()).toEqual([])
    })

    it('are enabled before the check', async () => {
      renderTrainer()
      expect(disabled()).toEqual([])

      await fireEvent.click(nameButton('mi'))

      expect(disabled()).toEqual([])
    })

    it('stay enabled when Check without a name shows the hint', async () => {
      renderTrainer()

      await fireEvent.click(checkButton())

      expect(queryHint()).not.toBeNull()
      expect(disabled()).toEqual([])
    })
  })

  describe('checking without a note name', () => {
    it('shows the hint in the status message and no result', async () => {
      renderTrainer()

      await fireEvent.click(checkButton())

      expect(status()?.textContent?.trim()).toBe('Choose a note name first')
      expect(queryResult()).toBeNull()
      expect(queryCheck()).not.toBeNull()
      expect(queryNext()).toBeNull()
    })

    it('hides the hint once a note name is chosen', async () => {
      renderTrainer()
      await fireEvent.click(checkButton())

      await fireEvent.click(nameButton('fa'))

      expect(queryHint()).toBeNull()
      expect(pressed()).toEqual(['fa'])
    })
  })

  describe('going to the next question', () => {
    it('clears the selection and the message and shows Check again', async () => {
      renderTrainer()
      await answer('do')

      await fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      expect(pressed()).toEqual([])
      expect(queryResult()).toBeNull()
      expect(queryCheck()).not.toBeNull()
      expect(queryNext()).toBeNull()
    })

    it('moves the keyboard focus to Check', async () => {
      renderTrainer()
      await answer('do')
      screen.getByRole('button', { name: 'Next' }).focus()

      await fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      await waitFor(() => expect(document.activeElement).toBe(queryCheck()))
    })

    it('grades the new question', async () => {
      renderTrainer(startingOnC4())
      await answer('re')
      await fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      // Второй вопрос — D4: do был бы верен только для прежней C4.
      await answer('re')

      expect(status()?.textContent?.trim()).toBe('Correct')
    })
  })

  describe('notes from C4 to C5', () => {
    it('shows the note picked by the injected random source', () => {
      renderTrainer(startingOnG4())

      expect(shownPitch()).toBe('G4')
    })

    it('says "Correct" for sol on G4', async () => {
      renderTrainer(startingOnG4())

      await answer('sol')

      expect(status()?.textContent?.trim()).toBe('Correct')
    })

    it('says "Incorrect" for do on G4', async () => {
      renderTrainer(startingOnG4())

      await answer('do')

      expect(status()?.textContent?.trim()).toBe('Incorrect')
    })

    it('says "Correct" for do on C5', async () => {
      renderTrainer(startingOnC5())
      expect(shownPitch()).toBe('C5')

      await answer('do')

      expect(status()?.textContent?.trim()).toBe('Correct')
    })

    it('shows a note of another pitch after Next', async () => {
      renderTrainer(startingOnC4())
      expect(shownPitch()).toBe('C4')
      await answer('do')

      await fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      expect(shownPitch()).toBe('D4')
    })
  })

  // ТЗ 13: экран получает источник случайности от точки сборки и не создаёт
  // свой. Без provide он не должен молча взять Math.random.
  describe('without a random source', () => {
    it('fails with an error naming the missing random source', () => {
      expect(() =>
        render(TrainerView, {
          global: {
            plugins: [createAppI18n(), createPinia()],
            stubs: { StaffView: StaffViewStub },
            provide: { [schedulerKey as symbol]: createManualClock().scheduler },
          },
        }),
      ).toThrow(/random/i)
    })
  })

  // ТЗ 13: таймер автоперехода тоже приходит от точки сборки.
  describe('without a scheduler', () => {
    it('fails with an error naming the missing scheduler', () => {
      expect(() =>
        render(TrainerView, {
          global: {
            plugins: [createAppI18n(), createPinia()],
            stubs: { StaffView: StaffViewStub },
            provide: { [randomKey as symbol]: startingOnC4() },
          },
        }),
      ).toThrow(/scheduler/i)
    })
  })

  describe('the "Open next question automatically" box', () => {
    it('is a checkbox shown next to Check, unticked on open', () => {
      renderTrainer()

      expect(autoNext().checked).toBe(false)
      expect(queryCheck()).not.toBeNull()
    })

    it('is still shown next to Next after the check', async () => {
      renderTrainer()

      await answer('do')

      expect(queryNext()).not.toBeNull()
      expect(autoNext()).toBeTruthy()
    })

    it('is ticked and unticked by pressing it', async () => {
      renderTrainer()

      await fireEvent.click(autoNext())
      expect(autoNext().checked).toBe(true)

      await fireEvent.click(autoNext())
      expect(autoNext().checked).toBe(false)
    })
  })

  describe('opening the next question automatically', () => {
    it('keeps the result and Next for 1.5 seconds after Check', async () => {
      const clock = renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')

      await clock.elapse(1499)

      expect(status()?.textContent?.trim()).toBe('Correct')
      expect(queryNext()).not.toBeNull()
      expect(shownPitch()).toBe('C4')
    })

    it('opens a new question 1.5 seconds after Check with the selection and the message cleared', async () => {
      const clock = renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')

      await clock.elapse(1500)

      await waitFor(() => expect(shownPitch()).toBe('D4'))
      expect(pressed()).toEqual([])
      expect(disabled()).toEqual([])
      expect(status()?.textContent?.trim()).toBe('')
      expect(queryCheck()).not.toBeNull()
      expect(queryNext()).toBeNull()
      expect(autoNext().checked).toBe(true)
    })

    it('works after a wrong answer too', async () => {
      const clock = renderTrainer()
      await fireEvent.click(autoNext())
      await answer('re')

      await clock.elapse(1500)

      await waitFor(() => expect(shownPitch()).toBe('D4'))
      expect(queryCheck()).not.toBeNull()
    })

    it('keeps going question after question while ticked', async () => {
      const clock = renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')
      await clock.elapse(1500)
      await waitFor(() => expect(shownPitch()).toBe('D4'))

      await answer('re')
      await clock.elapse(1500)

      await waitFor(() => expect(shownPitch()).toBe('C4'))
      expect(queryCheck()).not.toBeNull()
    })

    it('goes to the next question once when Next is pressed during the pause', async () => {
      const clock = renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')

      await fireEvent.click(nextButton())
      expect(shownPitch()).toBe('D4')
      await clock.elapse(1500)

      // Второй переход вернул бы C4 и сбросил бы экран ещё раз.
      expect(shownPitch()).toBe('D4')
      expect(queryCheck()).not.toBeNull()
      expect(clock.pending()).toBe(0)
    })

    it('does not start after Check without a note name', async () => {
      const clock = renderTrainer()
      await fireEvent.click(autoNext())

      await fireEvent.click(checkButton())
      await clock.elapse(1500)

      expect(clock.pending()).toBe(0)
      expect(shownPitch()).toBe('C4')
      expect(status()?.textContent?.trim()).toBe('Choose a note name first')
    })

    it('does not act on a result already shown when the box is ticked', async () => {
      const clock = renderTrainer()
      await answer('do')

      await fireEvent.click(autoNext())
      await clock.elapse(1500)

      expect(shownPitch()).toBe('C4')
      expect(status()?.textContent?.trim()).toBe('Correct')
      expect(queryNext()).not.toBeNull()
    })

    it('acts from the next check after being ticked on a shown result', async () => {
      const clock = renderTrainer()
      await answer('do')
      await fireEvent.click(autoNext())
      await fireEvent.click(nextButton())

      await answer('re')
      await clock.elapse(1500)

      await waitFor(() => expect(shownPitch()).toBe('C4'))
      expect(queryCheck()).not.toBeNull()
    })

    it('is cancelled when the box is unticked during the pause', async () => {
      const clock = renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')

      await fireEvent.click(autoNext())
      await clock.elapse(1500)

      expect(shownPitch()).toBe('C4')
      expect(status()?.textContent?.trim()).toBe('Correct')
      expect(queryNext()).not.toBeNull()

      await fireEvent.click(nextButton())
      expect(shownPitch()).toBe('D4')
    })

    it('does not happen while the box is unticked', async () => {
      const clock = renderTrainer()

      await answer('do')
      await clock.elapse(10_000)

      expect(clock.pending()).toBe(0)
      expect(shownPitch()).toBe('C4')
      expect(queryNext()).not.toBeNull()
    })
  })

  describe('keyboard focus after opening the next question automatically', () => {
    it('moves from Next to Check', async () => {
      const clock = renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')
      nextButton().focus()

      await clock.elapse(1500)

      await waitFor(() => expect(document.activeElement).toBe(queryCheck()))
    })

    it('stays on the box when it is focused', async () => {
      const clock = renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')
      autoNext().focus()

      await clock.elapse(1500)

      await waitFor(() => expect(queryCheck()).not.toBeNull())
      // Фокус переводится после перерисовки: даём ей случиться и проверяем, что он не ушёл.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(document.activeElement).toBe(autoNext())
    })
  })

  describe('when the staff fails to load', () => {
    it('shows a reload message in place of the staff', async () => {
      renderTrainer()

      failStaffLoading()

      expect(await screen.findByText("Couldn't load the staff. Reload the page.")).toBeTruthy()
      expect(screen.queryByRole('img', { name: 'Music staff' })).toBeNull()
    })

    it('hides the note name buttons and Check', async () => {
      renderTrainer()

      failStaffLoading()

      await screen.findByText("Couldn't load the staff. Reload the page.")
      for (const name of NAMES) {
        expect(screen.queryByRole('button', { name })).toBeNull()
      }
      expect(queryCheck()).toBeNull()
      expect(queryNext()).toBeNull()
    })
  })
})
