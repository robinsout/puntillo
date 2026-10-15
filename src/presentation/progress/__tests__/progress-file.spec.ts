import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { FileSaver, KeyValueStorage } from '@/application/ports'
import { presetDifficulty } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import {
  NO_HISTORY,
  NO_STATISTICS,
  parseProgressFile,
  serializeProgressFile,
  type ProgressFile,
  type SavedSession,
} from '@/domain/progress'
import { createQuestion, type Duration } from '@/domain/question'
import { EMPTY_REVIEW_QUEUE, type ReviewItem } from '@/domain/review-queue'
import { EMPTY_SCORE, NO_MISTAKES, recordGrade } from '@/domain/session'
import { goToSection, openSettings, renderApp, TRAINER } from '@/presentation/__tests__/app'
import { forgetDialogs, isOpenAsModal, pressEscape } from '@/presentation/__tests__/dialog'
import type { IconName } from '@/presentation/ui'
import UiIcon from '@/presentation/ui/UiIcon.vue'
import {
  createManualWallClock,
  createMemoryStorage,
  mistakeLine,
  progressOver,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature progress-and-storage, slice 4: export and import by a file on the screen Progress
// (criteria 14–17, 20, edge cases 3–5; the sizes, the 360 px width and the keyboard are the
// end-to-end tests').
//
// - Below the sections, the buttons Export progress and Import progress.
// - Export progress saves "puntillo-progress-2026-10-13.json", named by the day of the device,
//   with all that is kept.
// - Import progress opens the choice of a file, a JSON one. A file read as Puntillo progress opens
//   a modal dialog named "Replace your current progress with the file?" with Replace and Cancel;
//   Esc is Cancel. Replace puts the file in place of all that is kept and says "Progress
//   imported."; the language and the preferences of the file apply at once. Cancel changes
//   nothing. Either way the focus goes back to Import progress, decided in slice 4.
// - Any other file is turned down with "This file can't be read as Puntillo progress. Your
//   progress hasn't changed." and no dialog.
// - The messages are in role="status".
//
// Feature design-system, slice 6, criterion 11: Export progress and Import progress are secondary
// buttons of the system. A message is a notice of the system: Progress imported. with the check
// of "right", a file turned down with the cross of "wrong", so it is told not by colour alone;
// without a message there is no notice. Their colours and places are CSS, seen in e2e.
//
// The page saves files through the FileSaver given to it; here one that records them. A file is
// chosen as a browser gives it: a change of the file input. A new render over the same storage
// stands for a page reload. Feature navigation-and-settings, slice 1: the preferences of the file
// show on the settings screen.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    progress: 'Progress',
    exportProgress: 'Export progress',
    importProgress: 'Import progress',
    question: 'Replace your current progress with the file?',
    replace: 'Replace',
    cancel: 'Cancel',
    imported: 'Progress imported.',
    rejected: "This file can't be read as Puntillo progress. Your progress hasn't changed.",
  },
  ru: {
    progress: 'Прогресс',
    exportProgress: 'Сохранить в файл',
    importProgress: 'Загрузить из файла',
    question: 'Заменить текущий прогресс данными из файла?',
    replace: 'Заменить',
    cancel: 'Отмена',
    imported: 'Прогресс загружен.',
    rejected: 'Этот файл не похож на прогресс Puntillo. Ваш прогресс не изменился.',
  },
  es: {
    progress: 'Progreso',
    exportProgress: 'Exportar progreso',
    importProgress: 'Importar progreso',
    question: '¿Reemplazar tu progreso actual con el archivo?',
    replace: 'Reemplazar',
    cancel: 'Cancelar',
    imported: 'Progreso importado.',
    rejected:
      'Este archivo no se puede leer como progreso de Puntillo. Tu progreso no ha cambiado.',
  },
} as const satisfies Record<Locale, Record<string, string>>

type Texts = Record<keyof typeof TEXTS.en, string>

const EN: Texts = TEXTS.en

const QUARTER: Duration = { value: 'quarter' }
const C4: ReviewItem = { pitch: { letter: 'C', octave: 4 }, duration: QUARTER }
const F_SHARP_4: ReviewItem = {
  pitch: { letter: 'F', octave: 4, alteration: 1 },
  duration: QUARTER,
}

const OCT_12_2026 = Date.UTC(2026, 9, 12, 12)

// A session of 20 left on its seventh question, not checked yet.
const SAVED: SavedSession = {
  exercise: 'read',
  length: 20,
  difficulty: presetDifficulty('confident-reading'),
  attempts: 2,
  number: 7,
  elapsedMs: 84_000,
  score: recordGrade(EMPTY_SCORE, [{ pitch: true, duration: false }], 2_000),
  mistakes: NO_MISTAKES,
  reviewQueue: EMPTY_REVIEW_QUEUE,
  question: createQuestion({ pitch: { letter: 'G', octave: 4 }, duration: QUARTER }),
  grades: null,
}

// Of another device: names by letters, in Advanced, writing notes; a session of the day before
// and F♯4 wrong 3 times of 12; a session not finished.
const FILE: ProgressFile = {
  preferences: {
    language: 'en',
    noteNaming: 'letter',
    seventhNote: 'B',
    autoAdvance: false,
    showAnswerAtOnce: false,
    preset: 'advanced',
    difficulty: presetDifficulty('advanced'),
    exercise: 'write',
    showNoteNames: false,
  },
  statistics: {
    items: [
      { item: F_SHARP_4, shown: 12, mistakes: 3, lastShownAt: OCT_12_2026, lastRight: false },
    ],
  },
  history: {
    sessions: [
      {
        finishedAt: OCT_12_2026,
        exercise: 'write',
        length: { minutes: 5 },
        questions: 12,
        accuracy: 67,
      },
    ],
  },
  session: SAVED,
}

const FILE_SESSION_LINE = '12 Oct · Write notes · 5 min · 12 questions · 67%'
const FILE_HARDEST_LINE = 'F♯4, quarter note / 3 mistakes of 12'

const OWN_SESSION_LINE = '13 Oct · Read notes · 20 questions · 85%'
const OWN_HARDEST_LINE = 'do4, quarter note / 1 mistake of 1'

const fileIn = (language: Locale): ProgressFile => ({
  ...FILE,
  preferences: { ...FILE.preferences, language },
})

// Earlier sessions as they left the storage: one of 20 on 13 Oct, C4 wrong once.
function storageWithOwnProgress(storage: KeyValueStorage = createMemoryStorage()) {
  const progress = progressOver(storage)
  progress.recordAnswers([{ item: C4, right: false }])
  progress.recordSession({ exercise: 'read', length: 20, questions: 20, accuracy: 85 })
  return storage
}

function recordingSaver() {
  const saved: { name: string; text: string }[] = []
  const saver: FileSaver = {
    save(name, text) {
      saved.push({ name, text })
    },
  }
  return { saver, saved }
}

const button = (name: string) => screen.getByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))

const listItems = (name: string) => {
  const list = screen.queryByRole('list', { name })
  return list ? within(list).getAllByRole('listitem') : []
}

// The lines of a session keep the no-break space of "85 %". Feature design-system, slice 6: a line
// of a note gives the item and its count apart, as mistakeLine reads it.
const sessionLines = () =>
  listItems('Recent sessions').map(
    (item) => item.textContent?.replace(/[ \t\r\n]+/g, ' ').trim() ?? '',
  )
const hardestLines = () => listItems('Hardest notes').map(mistakeLine)

const statusText = () =>
  screen
    .queryAllByRole('status')
    .map((status) => status.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter((text) => text !== '')
    .join(' ')

const confirmation = (texts: Texts = EN) => screen.queryByRole('dialog', { name: texts.question })

async function openProgress(texts: Texts = EN, locale: Locale = 'en') {
  await goToSection(texts.progress, locale)
  await screen.findByRole('heading', { level: 1, name: texts.progress })
}

async function visitProgress(
  storage: KeyValueStorage = createMemoryStorage(),
  locale: Locale = 'en',
  saver?: FileSaver,
) {
  await renderApp({ storage, locale, saver })
  await openProgress(TEXTS[locale], locale)
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('no file input')
  return input
}

// Import progress, then the file chosen in the dialog of the browser.
async function chooseFile(text: string, texts: Texts = EN) {
  await press(texts.importProgress)
  const file = new File([text], 'puntillo-progress-2026-10-12.json', { type: 'application/json' })
  await fireEvent.change(fileInput(), { target: { files: [file] } })
}

async function chooseProgressFile(file: ProgressFile, texts: Texts = EN) {
  await chooseFile(serializeProgressFile(file), texts)
  const dialog = await screen.findByRole('dialog', { name: texts.question })
  return dialog
}

async function replaceWith(file: ProgressFile, texts: Texts = EN) {
  const dialog = await chooseProgressFile(file, texts)
  await fireEvent.click(within(dialog).getByRole('button', { name: texts.replace }))
  await waitFor(() => expect(statusText()).toBe(texts.imported))
}

async function backToTrainer() {
  await goToSection(TRAINER.en)
  await screen.findByRole('heading', { level: 1, name: 'Trainer' })
}

describe('Export progress (criterion 14)', () => {
  it('stands on the screen Progress below the sections', async () => {
    await visitProgress()

    const hardest = screen.getByRole('heading', { level: 2, name: 'Hardest notes' })
    for (const name of [EN.exportProgress, EN.importProgress]) {
      expect(
        hardest.compareDocumentPosition(button(name)) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })

  it('saves a file named by the day', async () => {
    const { saver, saved } = recordingSaver()
    await visitProgress(createMemoryStorage(), 'en', saver)

    await press(EN.exportProgress)

    expect(saved.map(({ name }) => name)).toEqual(['puntillo-progress-2026-10-13.json'])
  })

  it('names the file by the day of the device on another day', async () => {
    const { saver, saved } = recordingSaver()
    await renderApp({ saver, wallClock: createManualWallClock(Date.UTC(2026, 0, 5, 12)).clock })
    await openProgress()

    await press(EN.exportProgress)

    expect(saved.map(({ name }) => name)).toEqual(['puntillo-progress-2026-01-05.json'])
  })

  it('saves the history and the statistics kept', async () => {
    const { saver, saved } = recordingSaver()
    await visitProgress(storageWithOwnProgress(), 'en', saver)

    await press(EN.exportProgress)

    const file = parseProgressFile(saved[0]?.text ?? '')
    expect(file?.history.sessions.map(({ exercise, questions }) => [exercise, questions])).toEqual([
      ['read', 20],
    ])
    expect(file?.statistics.items.map(({ item }) => item)).toEqual([C4])
  })

  it('saves the preferences and empty parts when nothing is kept yet (edge case 5)', async () => {
    const { saver, saved } = recordingSaver()
    await visitProgress(createMemoryStorage(), 'en', saver)

    await press(EN.exportProgress)

    const file = parseProgressFile(saved[0]?.text ?? '')
    expect(file).toMatchObject({
      preferences: { language: 'en', preset: 'first-steps', exercise: 'read' },
      statistics: NO_STATISTICS,
      history: NO_HISTORY,
      session: null,
    })
  })
})

describe('Import progress (criterion 15)', () => {
  it('offers JSON files to choose from', async () => {
    await visitProgress()

    const accepted = fileInput()
      .accept.split(',')
      .map((each) => each.trim())

    expect(accepted).toContain('.json')
  })

  it('asks before replacing, in a modal dialog with Replace and Cancel', async () => {
    await visitProgress()

    const dialog = await chooseProgressFile(FILE)

    expect(isOpenAsModal(dialog)).toBe(true)
    expect(within(dialog).getByRole('button', { name: EN.replace })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: EN.cancel })).toBeTruthy()
  })

  it('changes nothing while it asks', async () => {
    await visitProgress(storageWithOwnProgress())

    await chooseProgressFile(FILE)

    expect(sessionLines()).toEqual([OWN_SESSION_LINE])
    expect(hardestLines()).toEqual([OWN_HARDEST_LINE])
    expect(statusText()).toBe('')
  })
})

describe('Replace (criterion 16)', () => {
  it('says Progress imported. and closes the dialog', async () => {
    await visitProgress(storageWithOwnProgress())

    await replaceWith(FILE)

    expect(confirmation()).toBeNull()
    expect(statusText()).toBe(EN.imported)
  })

  it('shows the sessions and the notes of the file in place of those kept', async () => {
    await visitProgress(storageWithOwnProgress())

    await replaceWith(FILE)

    expect(sessionLines()).toEqual([FILE_SESSION_LINE])
    expect(hardestLines()).toEqual([FILE_HARDEST_LINE])
  })

  it('takes the preferences of the file at once on the choice screen', async () => {
    await visitProgress()

    await replaceWith(FILE)
    await backToTrainer()

    expect(screen.getByRole('button', { name: 'Advanced' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    const exercise =
      screen.queryByRole('radiogroup', { name: 'Exercise' }) ??
      screen.getByRole('group', { name: 'Exercise' })
    expect(
      within(exercise).getByRole<HTMLInputElement>('radio', { name: 'Write notes' }).checked,
    ).toBe(true)
  })

  it('takes the naming and Show the right answer at once of the file on the settings screen', async () => {
    await visitProgress()

    await replaceWith({ ...FILE, preferences: { ...FILE.preferences, showAnswerAtOnce: true } })
    await backToTrainer()
    await openSettings()

    const naming = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Note names' })
    expect(naming.selectedOptions[0]?.textContent?.trim()).toBe('C, D, E')
    const atOnce = screen.getByRole<HTMLInputElement>('checkbox', {
      name: 'Show the right answer at once',
    })
    expect(atOnce.checked).toBe(true)
  })

  it('offers the session not finished of the file on the choice screen', async () => {
    await visitProgress()

    await replaceWith(FILE)
    await backToTrainer()

    expect(screen.getByRole('region', { name: 'Unfinished session' })).toBeTruthy()
  })

  it('drops the session not finished when the file has none (edge case 3)', async () => {
    const storage = createMemoryStorage()
    progressOver(storage).saveSession(SAVED)
    await renderApp({ storage })
    expect(screen.getByRole('region', { name: 'Unfinished session' })).toBeTruthy()
    await openProgress()

    await replaceWith({ ...FILE, session: null })
    await backToTrainer()

    expect(screen.queryByRole('region', { name: 'Unfinished session' })).toBeNull()
  })

  it('switches the interface to the language of the file at once', async () => {
    await visitProgress()

    await replaceWith(fileIn('ru'), { ...EN, imported: TEXTS.ru.imported })

    expect(screen.getByRole('heading', { level: 1, name: TEXTS.ru.progress })).toBeTruthy()
    expect(button(TEXTS.ru.importProgress)).toBeTruthy()
    expect(document.documentElement.lang).toBe('ru')
  })

  it('keeps all of it over a reload', async () => {
    const storage = storageWithOwnProgress()
    await visitProgress(storage)
    await replaceWith(FILE)
    cleanup()

    await visitProgress(storage)

    expect(sessionLines()).toEqual([FILE_SESSION_LINE])
    expect(hardestLines()).toEqual([FILE_HARDEST_LINE])
  })

  it('gives the focus back to Import progress', async () => {
    await visitProgress()

    await replaceWith(FILE)

    expect(document.activeElement).toBe(button(EN.importProgress))
  })
})

describe('Replace when the storage cannot save (edge case 4)', () => {
  it('shows the progress of the file until the page is closed', async () => {
    await visitProgress(unavailableStorage())

    await replaceWith(FILE)

    expect(sessionLines()).toEqual([FILE_SESSION_LINE])
    expect(hardestLines()).toEqual([FILE_HARDEST_LINE])
  })

  it('still says on the choice screen and on the settings screen that nothing is saved', async () => {
    await visitProgress(unavailableStorage())

    await replaceWith(FILE)
    await backToTrainer()

    expect(screen.getByText("Progress and settings won't be saved in this browser.")).toBeTruthy()
    await openSettings()
    expect(screen.getByText("Progress and settings won't be saved in this browser.")).toBeTruthy()
  })
})

describe('Cancel (criterion 16)', () => {
  it('closes the dialog and changes nothing', async () => {
    await visitProgress(storageWithOwnProgress())
    const dialog = await chooseProgressFile(FILE)

    await fireEvent.click(within(dialog).getByRole('button', { name: EN.cancel }))

    expect(confirmation()).toBeNull()
    expect(sessionLines()).toEqual([OWN_SESSION_LINE])
    expect(hardestLines()).toEqual([OWN_HARDEST_LINE])
    expect(statusText()).toBe('')
  })

  it('is what Esc does', async () => {
    await visitProgress(storageWithOwnProgress())
    await chooseProgressFile(FILE)

    await pressEscape()

    expect(confirmation()).toBeNull()
    expect(sessionLines()).toEqual([OWN_SESSION_LINE])
    expect(statusText()).toBe('')
  })

  it('keeps what was kept over a reload', async () => {
    const storage = storageWithOwnProgress()
    await visitProgress(storage)
    const dialog = await chooseProgressFile(FILE)
    await fireEvent.click(within(dialog).getByRole('button', { name: EN.cancel }))
    cleanup()

    await visitProgress(storage)

    expect(sessionLines()).toEqual([OWN_SESSION_LINE])
  })

  it('gives the focus back to Import progress', async () => {
    await visitProgress()
    const dialog = await chooseProgressFile(FILE)

    await fireEvent.click(within(dialog).getByRole('button', { name: EN.cancel }))

    expect(document.activeElement).toBe(button(EN.importProgress))
  })
})

describe('a file that is not Puntillo progress (criterion 17)', () => {
  it.each([
    ['not JSON', () => 'Name,Score\nAnna,10'],
    ['JSON of something else', () => JSON.stringify({ name: 'Anna', score: 10 })],
    [
      'with a value out of bounds',
      () => serializeProgressFile(FILE).replace('"noteNaming": "letter"', '"noteNaming": "runes"'),
    ],
  ])('is turned down when %s, with no dialog', async (_what, text) => {
    await visitProgress(storageWithOwnProgress())

    await chooseFile(text())

    await waitFor(() => expect(statusText()).toBe(EN.rejected))
    expect(confirmation()).toBeNull()
    expect(sessionLines()).toEqual([OWN_SESSION_LINE])
    expect(hardestLines()).toEqual([OWN_HARDEST_LINE])
  })

  it('leaves what was kept over a reload', async () => {
    const storage = storageWithOwnProgress()
    await visitProgress(storage)
    await chooseFile('not JSON')
    await waitFor(() => expect(statusText()).toBe(EN.rejected))
    cleanup()

    await visitProgress(storage)

    expect(sessionLines()).toEqual([OWN_SESSION_LINE])
  })

  it('gives way to Progress imported. when a good file is replaced next', async () => {
    await visitProgress()
    await chooseFile('not JSON')
    await waitFor(() => expect(statusText()).toBe(EN.rejected))

    await replaceWith(FILE)

    expect(statusText()).toBe(EN.imported)
  })
})

describe.each(['ru', 'es'] as const)('the texts in %s (criterion 20)', (locale) => {
  const texts = TEXTS[locale]

  it('names the buttons', async () => {
    await visitProgress(createMemoryStorage(), locale)

    expect(button(texts.exportProgress)).toBeTruthy()
    expect(button(texts.importProgress)).toBeTruthy()
  })

  it('asks and says the progress is imported', async () => {
    await visitProgress(createMemoryStorage(), locale)

    const dialog = await chooseProgressFile(fileIn(locale), texts)
    expect(within(dialog).getByRole('button', { name: texts.cancel })).toBeTruthy()
    await fireEvent.click(within(dialog).getByRole('button', { name: texts.replace }))

    await waitFor(() => expect(statusText()).toBe(texts.imported))
  })

  it('turns down a file that is not Puntillo progress', async () => {
    await visitProgress(createMemoryStorage(), locale)

    await chooseFile('not JSON', texts)

    await waitFor(() => expect(statusText()).toBe(texts.rejected))
  })
})

describe('the buttons and the messages in the design system (feature design-system, slice 6)', () => {
  // The drawing of an icon of the system, to tell which one a notice shows.
  function drawingOf(name: IconName): string {
    const host = document.createElement('div')
    const app = createApp({ render: () => h(UiIcon, { name }) })
    app.mount(host)
    const drawing = host.querySelector('svg')?.innerHTML ?? ''
    app.unmount()
    return drawing
  }

  // The icons of the messages, for the eye only: the text of the message says the same.
  const noticeIcons = () =>
    screen
      .queryAllByRole('status')
      .flatMap((status) => [...status.querySelectorAll('svg')])
      .map((icon) => ({ hidden: icon.getAttribute('aria-hidden'), drawing: icon.innerHTML }))

  it.each([EN.exportProgress, EN.importProgress])('makes %s a secondary button', async (name) => {
    await visitProgress()

    expect([...button(name).classList]).toEqual(expect.arrayContaining(['ui-button', 'secondary']))
  })

  it('shows no notice before a file is chosen', async () => {
    await visitProgress()

    expect(statusText()).toBe('')
    expect(noticeIcons()).toEqual([])
  })

  it('says Progress imported. with the check of "right"', async () => {
    await visitProgress()

    await replaceWith(FILE)

    expect(noticeIcons()).toEqual([{ hidden: 'true', drawing: drawingOf('check') }])
  })

  it('turns a file down with the cross of "wrong"', async () => {
    await visitProgress()

    await chooseFile('not JSON')

    await waitFor(() => expect(statusText()).toBe(EN.rejected))
    expect(noticeIcons()).toEqual([{ hidden: 'true', drawing: drawingOf('cross') }])
  })

  it('gives the check in place of the cross when a good file is replaced next', async () => {
    await visitProgress()
    await chooseFile('not JSON')
    await waitFor(() => expect(statusText()).toBe(EN.rejected))

    await replaceWith(FILE)

    expect(noticeIcons()).toEqual([{ hidden: 'true', drawing: drawingOf('check') }])
  })

  it('shows no notice while it asks', async () => {
    await visitProgress()
    await chooseFile('not JSON')
    await waitFor(() => expect(statusText()).toBe(EN.rejected))

    await chooseProgressFile(FILE)

    expect(statusText()).toBe('')
    expect(noticeIcons()).toEqual([])
  })
})

// Feature design-system, slice 7, criterion 11: the question to replace is a dialog of the system
// in the middle of the screen, Replace its primary button and Cancel a secondary one.
describe('the question to replace in the design system', () => {
  it('is a dialog of the system in the middle', async () => {
    await visitProgress()

    const dialog = await chooseProgressFile(FILE)

    expect([...dialog.classList]).toEqual(expect.arrayContaining(['ui-dialog', 'center']))
  })

  it('makes Replace its primary button and Cancel a secondary one', async () => {
    await visitProgress()

    const dialog = await chooseProgressFile(FILE)

    expect([...within(dialog).getByRole('button', { name: EN.replace }).classList]).toEqual(
      expect.arrayContaining(['ui-button', 'primary']),
    )
    expect([...within(dialog).getByRole('button', { name: EN.cancel }).classList]).toEqual(
      expect.arrayContaining(['ui-button', 'secondary']),
    )
  })
})
