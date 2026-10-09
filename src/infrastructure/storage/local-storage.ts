import type { KeyValueStorage } from '@/application/ports'

// Takes a source rather than the storage itself: with site data blocked, even reading
// window.localStorage throws.
export function createLocalStorage(
  source: () => Storage | null = () => window.localStorage,
): KeyValueStorage {
  return {
    get(key) {
      try {
        return source()?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    set(key, value) {
      try {
        source()?.setItem(key, value)
      } catch {
        // A full or unavailable storage keeps the choice for this page only.
      }
    },
  }
}
