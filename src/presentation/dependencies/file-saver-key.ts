import type { InjectionKey } from 'vue'
import type { FileSaver } from '@/application/ports'

export const fileSaverKey: InjectionKey<FileSaver> = Symbol('fileSaver')
