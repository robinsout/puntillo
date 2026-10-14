import { expect } from 'vitest'
import { createPinia } from 'pinia'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import App from '@/App.vue'
import type {
  FileSaver,
  KeyValueStorage,
  MidiInput,
  Random,
  WallClock,
  WikiLibrary,
} from '@/application/ports'
import type { Preferences } from '@/application/preferences'
import type { Progress } from '@/application/progress'
import type { KeySound } from '@/application/sound'
import type { Locale } from '@/domain/language'
import { createAppI18n } from '@/infrastructure/i18n'
import {
  clockKey,
  fileSaverKey,
  keySoundKey,
  midiInputKey,
  preferencesKey,
  progressKey,
  randomKey,
  timerKey,
  wallClockKey,
  wikiLibraryKey,
} from '@/presentation/dependencies'
import { routes } from '@/presentation/router'
import {
  constant,
  createManualClock,
  createManualWallClock,
  createMemoryStorage,
  preferencesFor,
  progressOver,
  StaffViewStub,
} from './screen'
import { fakeWikiLibrary } from './wiki-library'

export {
  EXAMPLE_LABEL,
  fakeWikiLibrary,
  HINT_LABEL,
  hintText,
  PRACTICE,
  RELATED,
  type Loading,
} from './wiki-library'

// The whole app on its routes, feature wiki and on: the choice screen at /, the wiki under /wiki.

export interface AppVisit {
  path?: string
  locale?: Locale
  // The storage of the page: the preferences and the progress are read from it unless given.
  storage?: KeyValueStorage
  // The day of the device, 13 Oct 2026 unless given: the progress dates its answers and the
  // exported file by it.
  wallClock?: WallClock
  preferences?: Preferences
  progress?: Progress
  library?: WikiLibrary
  random?: Random
  // Takes the files the page saves; unless given, one that drops them.
  saver?: FileSaver
  // Without one, none is provided: the keys are silent.
  keySound?: KeySound
  // Without one, none is provided: no instrument is heard.
  midiInput?: MidiInput
}

// A new user, so First steps, unless preferences or a storage are given. The random source, unless
// given, and the clock are those of the session tests. A new render over the same storage stands
// for a page reload.
export async function renderApp({
  path = '/',
  locale = 'en',
  storage = createMemoryStorage(),
  wallClock = createManualWallClock().clock,
  preferences = preferencesFor([locale], storage),
  progress = progressOver(storage, wallClock),
  library = fakeWikiLibrary().library,
  random = constant(0),
  saver = { save: () => {} },
  keySound,
  midiInput,
}: AppVisit = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  document.documentElement.lang = preferences.language
  const time = createManualClock()
  const result = render(App, {
    global: {
      plugins: [createAppI18n(preferences.language), createPinia(), router],
      stubs: { StaffView: StaffViewStub },
      provide: {
        [randomKey as symbol]: random,
        [clockKey as symbol]: time.clock,
        [timerKey as symbol]: time.timer,
        [preferencesKey as symbol]: preferences,
        [progressKey as symbol]: progress,
        [wikiLibraryKey as symbol]: library,
        [wallClockKey as symbol]: wallClock,
        [fileSaverKey as symbol]: saver,
        ...(keySound && { [keySoundKey as symbol]: keySound }),
        ...(midiInput && { [midiInputKey as symbol]: midiInput }),
      },
    },
  })
  return { ...result, router }
}

// Feature navigation-and-settings, slice 1: the settings screen at /settings. Slice 2: the
// sections of the app, Trainer, Progress, Wiki and Settings, are reached by the navigation of the
// header, a nav named Sections, in this order.
export const SETTINGS: Record<Locale, string> = { en: 'Settings', ru: 'Настройки', es: 'Ajustes' }
export const TRAINER: Record<Locale, string> = { en: 'Trainer', ru: 'Тренажёр', es: 'Entrenador' }
export const PROGRESS: Record<Locale, string> = { en: 'Progress', ru: 'Прогресс', es: 'Progreso' }
export const WIKI: Record<Locale, string> = { en: 'Wiki', ru: 'Справка', es: 'Wiki' }
export const SECTIONS: Record<Locale, string> = { en: 'Sections', ru: 'Разделы', es: 'Secciones' }
export const SECTION_LINKS = {
  en: [TRAINER.en, PROGRESS.en, WIKI.en, SETTINGS.en],
  ru: [TRAINER.ru, PROGRESS.ru, WIKI.ru, SETTINGS.ru],
  es: [TRAINER.es, PROGRESS.es, WIKI.es, SETTINGS.es],
} as const satisfies Record<Locale, readonly string[]>

export const navigation = (locale: Locale = 'en') =>
  screen.getByRole('navigation', { name: SECTIONS[locale] })
export const queryNavigation = (locale: Locale = 'en') =>
  screen.queryByRole('navigation', { name: SECTIONS[locale] })
export const sectionLink = (name: string, locale: Locale = 'en') =>
  within(navigation(locale)).getByRole('link', { name })
// The content of the screen, without the header and its navigation.
export const content = () => within(screen.getByRole('main'))

export async function goToSection(name: string, locale: Locale = 'en') {
  await fireEvent.click(sectionLink(name, locale))
}

export const renderSettings = (visit: AppVisit = {}) => renderApp({ ...visit, path: '/settings' })

export async function openSettings(locale: Locale = 'en') {
  await goToSection(SETTINGS[locale], locale)
  await screen.findByRole('heading', { level: 1, name: SETTINGS[locale] })
}

// Back on the choice screen, or on the question of a session going on.
export async function backToTrainer(locale: Locale = 'en') {
  await goToSection(TRAINER[locale], locale)
  await waitFor(() =>
    expect(screen.queryByRole('heading', { level: 1, name: SETTINGS[locale] })).toBeNull(),
  )
}

// Criterion 9: changed in the middle of a session, the quick mode acts back on the question. The
// question screen has no navigation, and the way there through a hint and its article is taken in
// e2e, so the router stands for it.
export async function setQuickModeInSettings(router: Router, on: boolean) {
  await router.push('/settings')
  await screen.findByRole('heading', { level: 1, name: SETTINGS.en })
  const box = screen.getByRole<HTMLInputElement>('checkbox', {
    name: 'Open next question automatically',
  })
  if (box.checked !== on) await fireEvent.click(box)
  await backToTrainer()
}
