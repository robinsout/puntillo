import { inject, type InjectionKey } from 'vue'
import type { KeySound } from '@/application/sound'

export const keySoundKey: InjectionKey<KeySound> = Symbol('keySound')

const SILENT: KeySound = { prepare: () => {}, play: () => {}, playMidi: () => {} }

export const useKeySound = (): KeySound => inject(keySoundKey, SILENT)
