import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { StaffView } from '@/infrastructure/notation'
import { createQuestion } from '@/domain/question'

// Отказ загрузки отложенного чанка VexFlow (сеть, устаревший деплой):
// динамический импорт отклоняется. Отдельный файл, потому что мок модуля
// действует на весь файл спеки.
vi.mock('vexflow/bravura', () => {
  throw new Error('chunk failed to load')
})

const question = createQuestion({
  pitch: { letter: 'C', octave: 4 },
  duration: { value: 'whole' },
})

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

async function settled() {
  // Даём отклонённому импорту и обработчикам гарантированно отработать.
  for (let tick = 0; tick < 5; tick += 1) await flushPromises()
}

describe('StaffView when VexFlow fails to load', () => {
  it('reports the failure once', async () => {
    wrapper = mount(StaffView, {
      props: { question, label: 'Music staff' },
      attachTo: document.body,
    })

    await vi.waitFor(() => expect(wrapper?.emitted('load-error')).toBeDefined())
    await settled()

    expect(wrapper.emitted('load-error')).toHaveLength(1)
  })

  it('draws nothing', async () => {
    wrapper = mount(StaffView, {
      props: { question, label: 'Music staff' },
      attachTo: document.body,
    })

    await vi.waitFor(() => expect(wrapper?.emitted('load-error')).toBeDefined())
    await settled()

    expect(wrapper.element.querySelector('svg')).toBeNull()
  })
})
