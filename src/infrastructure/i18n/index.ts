import { createI18n } from 'vue-i18n'
import en from './en'
import es from './es'
import type { Locale } from './locale'
import ru from './ru'

export { pickLocale, type Locale } from './locale'

export function createAppI18n(locale: Locale) {
  return createI18n({ legacy: false, locale, messages: { ru, en, es } })
}
