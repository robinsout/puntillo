import type { InjectionKey } from 'vue'
import type { WikiLibrary } from '@/application/ports'

export const wikiLibraryKey: InjectionKey<WikiLibrary> = Symbol('wikiLibrary')
