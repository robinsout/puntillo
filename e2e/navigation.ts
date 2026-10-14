import type { Page } from '@playwright/test'

// Feature navigation-and-settings, slice 2: the sections of the app are reached by the navigation
// of the header, Sections, on every screen but the question of a session.

export type Language = 'en' | 'ru' | 'es'

export const SECTIONS: Record<Language, string> = {
  en: 'Sections',
  ru: 'Разделы',
  es: 'Secciones',
}

export const navigation = (page: Page, language: Language = 'en') =>
  page.getByRole('navigation', { name: SECTIONS[language], exact: true })

export const section = (page: Page, name: string, language: Language = 'en') =>
  navigation(page, language).getByRole('link', { name, exact: true })
