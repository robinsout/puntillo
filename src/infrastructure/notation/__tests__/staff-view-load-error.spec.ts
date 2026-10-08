import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { StaffView } from '@/infrastructure/notation'
import { createQuestion } from '@/domain/question'

// Simulates a failed lazy VexFlow chunk (network, stale deploy). It lives in its own file
// because vi.mock applies to the whole spec file.
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
  // The rejected import reaches the handlers through several promise hops.
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

  it('does not report a drawn note', async () => {
    wrapper = mount(StaffView, {
      props: { question, label: 'Music staff' },
      attachTo: document.body,
    })

    await vi.waitFor(() => expect(wrapper?.emitted('load-error')).toBeDefined())
    await settled()

    expect(wrapper.emitted('drawn')).toBeUndefined()
  })
})
