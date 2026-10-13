import { createI18n } from 'vue-i18n'
import type { Locale } from '@/domain/language'
import en from './en'
import es from './es'
import ru from './ru'

const RUSSIAN_FORMS: Partial<Record<Intl.LDMLPluralRule, number>> = { one: 0, few: 1 }
const russianPlurals = new Intl.PluralRules('ru')

// The default rule knows two forms; Russian has three: 1 and 21, 2–4 and 22, the rest.
const russianPlural = (count: number) => RUSSIAN_FORMS[russianPlurals.select(count)] ?? 2

export function createAppI18n(locale: Locale) {
  return createI18n({
    legacy: false,
    locale,
    messages: { ru, en, es },
    pluralRules: { ru: russianPlural },
  })
}
