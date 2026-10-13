import { computed } from 'vue'
import { useSessionStore } from '@/presentation/session'

// The text of the way back to what the session keeps open, if anything: Practice this would
// replace it.
export function useSessionReturn() {
  const session = useSessionStore()
  return computed(() => {
    switch (session.state.phase) {
      case 'question':
        return 'wiki.backToQuestion'
      case 'results':
        return 'wiki.backToResults'
      default:
        return null
    }
  })
}
