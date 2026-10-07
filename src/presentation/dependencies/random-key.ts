import type { InjectionKey } from 'vue'
import type { Random } from '@/application/ports'

export const randomKey: InjectionKey<Random> = Symbol('random')
