import type { WallClock } from '@/application/ports'

export function createWallClock(): WallClock {
  return { now: () => Date.now() }
}
