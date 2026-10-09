import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalStorage } from '@/infrastructure/storage'

const fail = (name: string) => () => {
  throw new DOMException('storage is not available', name)
}

describe('createLocalStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('with an available localStorage', () => {
    it('returns what was set under the key', () => {
      const storage = createLocalStorage()

      storage.set('puntillo.test', 'ru')

      expect(storage.get('puntillo.test')).toBe('ru')
    })

    it('returns null for a key that was never set', () => {
      expect(createLocalStorage().get('puntillo.missing')).toBeNull()
    })

    it('writes to localStorage, so the value outlives the page', () => {
      createLocalStorage().set('puntillo.test', 'es')

      expect(localStorage.getItem('puntillo.test')).toBe('es')
    })

    it('reads what an earlier page left in localStorage', () => {
      localStorage.setItem('puntillo.test', 'en')

      expect(createLocalStorage().get('puntillo.test')).toBe('en')
    })

    it('overwrites the previous value', () => {
      const storage = createLocalStorage()

      storage.set('puntillo.test', 'ru')
      storage.set('puntillo.test', 'es')

      expect(storage.get('puntillo.test')).toBe('es')
    })

    it('uses the given storage instead of the global one', () => {
      const given = new Map<string, string>()
      const source = {
        getItem: (key: string) => given.get(key) ?? null,
        setItem: (key: string, value: string) => {
          given.set(key, value)
        },
      } as Pick<Storage, 'getItem' | 'setItem'> as Storage
      const storage = createLocalStorage(() => source)

      storage.set('puntillo.test', 'ru')

      expect(given.get('puntillo.test')).toBe('ru')
      expect(localStorage.getItem('puntillo.test')).toBeNull()
    })
  })

  // Spec §11: the trainer works when the storage is unavailable or full.
  describe('never throws', () => {
    it('when reading fails: the value is missing', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail('SecurityError'))
      const storage = createLocalStorage()

      expect(() => storage.get('puntillo.test')).not.toThrow()
      expect(storage.get('puntillo.test')).toBeNull()
    })

    it('when the storage is full: the value is not kept', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail('QuotaExceededError'))
      const storage = createLocalStorage()

      expect(() => storage.set('puntillo.test', 'ru')).not.toThrow()
      expect(localStorage.getItem('puntillo.test')).toBeNull()
    })

    it('when merely accessing localStorage throws, as with blocked site data', () => {
      const storage = createLocalStorage(fail('SecurityError'))

      expect(() => storage.set('puntillo.test', 'ru')).not.toThrow()
      expect(storage.get('puntillo.test')).toBeNull()
    })

    it('when there is no localStorage at all', () => {
      const storage = createLocalStorage(() => null)

      expect(() => storage.set('puntillo.test', 'ru')).not.toThrow()
      expect(storage.get('puntillo.test')).toBeNull()
    })
  })
})
