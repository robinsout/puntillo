export const LOCALES = ['en', 'ru', 'es'] as const

export type Locale = (typeof LOCALES)[number]

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

export function pickLocale(preferences: readonly string[]): Locale {
  for (const tag of preferences) {
    const language = tag.split('-')[0]!.toLowerCase()
    if (isLocale(language)) return language
  }
  return 'en'
}
