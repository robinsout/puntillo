// next() returns a number in [0, 1).
export interface Random {
  next(): number
}

// now() is in milliseconds and monotonic: only differences between readings are meaningful.
export interface Clock {
  now(): number
}

// Never throws: an unavailable or full storage reads as empty and drops writes.
export interface KeyValueStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}
