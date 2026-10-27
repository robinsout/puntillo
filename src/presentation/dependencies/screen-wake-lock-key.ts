import { inject, type InjectionKey } from 'vue'
import type { ScreenWakeLock } from '@/application/ports'

export const screenWakeLockKey: InjectionKey<ScreenWakeLock> = Symbol('screenWakeLock')

const NONE: ScreenWakeLock = { keepOn: () => {}, release: () => {} }

export const useScreenWakeLock = (): ScreenWakeLock => inject(screenWakeLockKey, NONE)
