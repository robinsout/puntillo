import type { InjectionKey } from 'vue'
import type { Progress } from '@/application/progress'

export const progressKey: InjectionKey<Progress> = Symbol('progress')
