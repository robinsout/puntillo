import { inject, type InjectionKey } from 'vue'
import type { MidiInput } from '@/application/ports'

export const midiInputKey: InjectionKey<MidiInput> = Symbol('midiInput')

const NONE: MidiInput = {
  connect: () => {},
  status: () => ({ kind: 'idle' }),
  onStatus: () => () => {},
  onKey: () => () => {},
}

export const useMidiInput = (): MidiInput => inject(midiInputKey, NONE)
