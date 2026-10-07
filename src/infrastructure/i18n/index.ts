import { createI18n } from 'vue-i18n'
import en from './en'

export function createAppI18n() {
  return createI18n({ legacy: false, locale: 'en', messages: { en } })
}
