import type { Random } from '@/application/ports'

export function createMathRandom(): Random {
  return { next: () => Math.random() }
}
