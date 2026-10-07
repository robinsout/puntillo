import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { createAppI18n } from '@/infrastructure/i18n'
import { TrainerView } from '@/presentation/trainer'

// Нотоносец подменяется заглушкой: адаптер VexFlow проверен своими тестами,
// а здесь важна граница — подпись изображения и событие отказа загрузки.
// Заглушка рисует то же доступное изображение и умеет сообщить об отказе.
let failStaffLoading: () => void = () => {
  throw new Error('staff is not rendered')
}

const StaffViewStub = defineComponent({
  props: { question: { type: Object, required: true }, label: { type: String, required: true } },
  emits: ['load-error'],
  setup(props, { emit }) {
    failStaffLoading = () => emit('load-error')
    return () => h('div', { role: 'img', 'aria-label': props.label })
  },
})

// Глобальных хуков Vitest нет, поэтому Testing Library не убирает экран сама.
afterEach(cleanup)

// В этом срезе вопрос всегда C4, верный ответ — do.
const NAMES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si']

function renderTrainer() {
  return render(TrainerView, {
    global: {
      plugins: [createAppI18n(), createPinia()],
      stubs: { StaffView: StaffViewStub },
    },
  })
}

const nameButton = (name: string) => screen.getByRole('button', { name })
const checkButton = () => screen.getByRole('button', { name: 'Check' })
const queryCheck = () => screen.queryByRole('button', { name: 'Check' })
const queryNext = () => screen.queryByRole('button', { name: 'Next' })
const status = () => screen.queryByRole('status')
const queryResult = () => screen.queryByText(/^(Correct|Incorrect)$/)
const queryHint = () => screen.queryByText('Choose a note name first')

const pressed = () =>
  NAMES.filter((name) => nameButton(name).getAttribute('aria-pressed') === 'true')

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
      renderTrainer()
      await answer('re')
      await fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      await answer('do')

      expect(status()?.textContent?.trim()).toBe('Correct')
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
