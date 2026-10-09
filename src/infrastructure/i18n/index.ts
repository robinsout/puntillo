import { createI18n } from 'vue-i18n'
import type { Locale } from '@/domain/language'
import en from './en'
import es from './es'
import ru from './ru'

export function createAppI18n(locale: Locale) {
  return createI18n({ legacy: false, locale, messages: { ru, en, es } })
}
