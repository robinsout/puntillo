import type { InjectionKey } from 'vue'
import type { Preferences } from '@/application/preferences'

export const preferencesKey: InjectionKey<Preferences> = Symbol('preferences')
