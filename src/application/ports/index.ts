// next() returns a number in [0, 1).
export interface Random {
  next(): number
}

// now() is in milliseconds and monotonic: only differences between readings are meaningful.
export interface Clock {
  now(): number
}
