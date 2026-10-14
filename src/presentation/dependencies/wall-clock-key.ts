import type { InjectionKey } from 'vue'
import type { WallClock } from '@/application/ports'

export const wallClockKey: InjectionKey<WallClock> = Symbol('wallClock')
