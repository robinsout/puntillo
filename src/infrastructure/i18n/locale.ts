const locales = ['ru', 'en', 'es'] as const

export type Locale = (typeof locales)[number]

function isLocale(language: string): language is Locale {
  return (locales as readonly string[]).includes(language)
}

export function pickLocale(preferences: readonly string[]): Locale {
  for (const tag of preferences) {
    const language = tag.split('-')[0]!.toLowerCase()
    if (isLocale(language)) return language
  }
  return 'en'
}
