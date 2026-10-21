import type { CounterOptOut } from '@/application/ports'
import { isCounterOff, setCounterOff } from './counter'

const PROBE_KEY = 'puntillo-counter-probe'

// Some browsers hand out a localStorage that throws, is full or forgets what is written.
function canSave(): boolean {
  try {
    const storage = globalThis.localStorage
    storage.setItem(PROBE_KEY, '1')
    const kept = storage.getItem(PROBE_KEY) === '1'
    storage.removeItem(PROBE_KEY)
    return kept
  } catch {
    return false
  }
}

export function createLocalCounterOptOut(): CounterOptOut {
  return { isOff: isCounterOff, setOff: setCounterOff, canSave }
}
