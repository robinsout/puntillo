import { expect } from 'vitest'
import { createPinia } from 'pinia'
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
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

// Feature navigation-and-settings, slice 1: the settings screen at /settings, reached by the link
// Settings on the choice screen and left by the link Trainer, until the navigation of slice 2.
export const SETTINGS: Record<Locale, string> = { en: 'Settings', ru: 'Настройки', es: 'Ajustes' }
export const TRAINER: Record<Locale, string> = { en: 'Trainer', ru: 'Тренажёр', es: 'Entrenador' }

export const renderSettings = (visit: AppVisit = {}) => renderApp({ ...visit, path: '/settings' })

export async function openSettings(locale: Locale = 'en') {
  await fireEvent.click(screen.getByRole('link', { name: SETTINGS[locale] }))
  await screen.findByRole('heading', { level: 1, name: SETTINGS[locale] })
}

// Back on the choice screen, or on the question of a session going on.
export async function backToTrainer(locale: Locale = 'en') {
  await fireEvent.click(screen.getByRole('link', { name: TRAINER[locale] }))
  await waitFor(() =>
    expect(screen.queryByRole('heading', { level: 1, name: SETTINGS[locale] })).toBeNull(),
  )
}

// Criterion 9: changed in the middle of a session, the quick mode acts back on the question. The
// question has no link to the settings in slice 1, so the router stands for the way there.
export async function setQuickModeInSettings(router: Router, on: boolean) {
  await router.push('/settings')
  await screen.findByRole('heading', { level: 1, name: SETTINGS.en })
  const box = screen.getByRole<HTMLInputElement>('checkbox', {
    name: 'Open next question automatically',
  })
  if (box.checked !== on) await fireEvent.click(box)
  await backToTrainer()
}
