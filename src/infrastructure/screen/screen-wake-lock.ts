import type { ScreenWakeLock } from '@/application/ports'

const ignore = () => {}

// The browser lets the lock go whenever the tab is hidden, so it is taken again once the tab is
// visible. It may also refuse it, on a low battery for one: the screen then simply goes dark.
export function createScreenWakeLock(): ScreenWakeLock {
  let wanted = false
  let sentinel: WakeLockSentinel | null = null
  let requesting = false

  async function take() {
    if (!('wakeLock' in navigator) || requesting || (sentinel && !sentinel.released)) return
    requesting = true
    try {
      const taken = await navigator.wakeLock.request('screen')
      if (wanted) sentinel = taken
      else void taken.release().catch(ignore)
    } catch {
      // Refused or unavailable: nothing to do.
    } finally {
      requesting = false
    }
  }

  const takeAgain = () => {
    if (document.visibilityState === 'visible') void take()
  }

  return {
    keepOn() {
      if (wanted) return
      wanted = true
      document.addEventListener('visibilitychange', takeAgain)
      void take()
    },
    release() {
      wanted = false
      document.removeEventListener('visibilitychange', takeAgain)
      void sentinel?.release().catch(ignore)
      sentinel = null
    },
  }
}
