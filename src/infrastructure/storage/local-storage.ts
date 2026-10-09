import type { KeyValueStorage } from '@/application/ports'

// Takes a source rather than the storage itself: with site data blocked, even reading
// window.localStorage throws.
export function createLocalStorage(
  source: () => Storage | null = () => window.localStorage,
): KeyValueStorage {
  // Stays set: the value that failed is lost anyway, so a later successful write
  // does not make the choices safe again.
  let writeFailed = false
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
        const storage = source()
        if (!storage) throw new Error('No storage')
        storage.setItem(key, value)
      } catch {
        // A full or unavailable storage keeps the choice for this page only.
        writeFailed = true
      }
    },
    canSave() {
      if (writeFailed) return false
      // Probes by reading, as a probe write could itself fill the storage.
      try {
        const storage = source()
        if (!storage) return false
        storage.getItem('puntillo')
        return true
      } catch {
        return false
      }
    },
  }
}
