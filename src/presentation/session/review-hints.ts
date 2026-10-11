import { onMounted, shallowRef, type ShallowRef } from 'vue'
import type { WikiTopic } from '@/domain/wiki'
import { useSessionStore } from './session-store'

export interface HintOpener {
  readonly topic: WikiTopic
  readonly index: number
}

// The Why? buttons of a review open the hints of the wiki; `status` holds the buttons in order.
export function useReviewHints(status: Readonly<ShallowRef<HTMLElement | null>>) {
  const store = useSessionStore()
  const whyButton = (index: number) => status.value?.querySelectorAll('button')[index]

  const hint = shallowRef<HintOpener | null>(null)

  // Spec §18: the hints come with the wiki, outside the initial bundle.
  const hintDialog = shallowRef<typeof import('@/presentation/wiki/HintDialog.vue').default>()

  async function openHint(sentence: HintOpener) {
    hintDialog.value ??= (await import('@/presentation/wiki/HintDialog.vue')).default
    hint.value = sentence
  }

  // Not every engine gives the focus back to the opener when a modal dialog closes.
  function closeHint() {
    const index = hint.value?.index
    hint.value = null
    if (index !== undefined) whyButton(index)?.focus()
  }

  function readArticle() {
    if (hint.value) store.rememberHintOpener(hint.value.index)
  }

  onMounted(() => {
    const opener = store.takeHintOpener()
    if (opener !== null) whyButton(opener)?.focus()
  })

  return { hint, hintDialog, openHint, closeHint, readArticle }
}
