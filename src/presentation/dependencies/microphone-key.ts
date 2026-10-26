import { inject, type InjectionKey } from 'vue'
import type { Microphone } from '@/application/ports'

export const microphoneKey: InjectionKey<Microphone> = Symbol('microphone')

const NONE: Microphone = {
  requestAccess: () => {},
  listen: () => {},
  stop: () => {},
  status: () => ({ kind: 'idle' }),
  onStatus: () => () => {},
}

export const useMicrophone = (): Microphone => inject(microphoneKey, NONE)
