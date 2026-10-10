import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { AccidentalSet, KeySignatureLimit, QuestionLength } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming } from '@/domain/naming'
import {
  forgetDialogs,
  isOpenAsModal,
  pressEscape,
  pressOutside,
} from '@/presentation/__tests__/dialog'
import {
  chooseLength,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  statusText,
} from '@/presentation/__tests__/screen'
import {
  fakeWikiLibrary,
  HINT_LABEL,
  hintText,
  type Loading,
} from '@/presentation/__tests__/wiki-library'

// Feature wiki, slice 3, criteria 8 and 11: in the review of a mistake each sentence that explains
// it is followed by a button Why?, described by its sentence. Why? opens a hint over the trainer,
// a modal dialog: the title of the topic of the sentence, the text of the hint with the notes in
// the naming of the user, its example on the staff, a link Read the article and Close. The session
// goes on underneath. The topic of each sentence is that of the table of the feature:
//
// - the wrong note, its place on the staff: Notes on the treble staff;
// - a note that sounds the same, a sign earlier in the bar, a natural cancelling it: Sharp, flat
//   and natural;
// - the key signature, a natural cancelling it: Key signatures;
// - the wrong duration: Durations of notes and rests.
//
// Leaving for the article and coming back is in src/presentation/wiki/__tests__/hints.spec.ts.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TITLES = {
  'treble-staff': 'Notes on the treble staff',
  durations: 'Durations of notes and rests',
  accidentals: 'Sharp, flat and natural',
  'key-signatures': 'Key signatures',
} as const

type Topic = keyof typeof TITLES

const TEXTS = {
  en: {
    why: 'Why?',
    readArticle: 'Read the article',
    close: 'Close',
    loading: 'Loading…',
    loadError: "Couldn't load the article.",
    noLimit: 'No limit',
    check: 'Check',
    flat: 'Flat',
    title: TITLES['treble-staff'],
  },
  ru: {
    why: 'Почему?',
    readArticle: 'Читать статью',
    close: 'Закрыть',
    loading: 'Загрузка…',
    loadError: 'Не удалось загрузить статью.',
    noLimit: 'Без ограничения',
    check: 'Проверить',
    flat: 'Бемоль',
    title: 'Ноты на нотоносце в скрипичном ключе',
  },
  es: {
    why: '¿Por qué?',
    readArticle: 'Leer el artículo',
    close: 'Cerrar',
    loading: 'Cargando…',
    loadError: 'No se pudo cargar el artículo.',
    noLimit: 'Sin límite',
    check: 'Comprobar',
    flat: 'Bemol',
    title: 'Notas en el pentagrama en clave de sol',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en

interface Setup {
  questionLength?: QuestionLength
  keySignatures?: KeySignatureLimit
  accidentals?: AccidentalSet
  showAnswerAtOnce?: boolean
  locale?: Locale
  naming?: NoteNaming
  loading?: Loading
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// As in accidentals.spec.ts: Confident reading in 4/4 alone, with sharps and flats and no key
// signature unless a test chooses otherwise. Here the right answer is shown at once unless a test
// chooses otherwise, so one Check gives the review.
async function renderTrainer(
  random: Random,
  {
    questionLength = 'one-note',
    keySignatures = 0,
    accidentals = 'sharp-and-flat',
    showAnswerAtOnce = true,
    locale = 'en',
    naming,
    loading = 'ready',
  }: Setup = {},
) {
  const storage = storageWith((preferences) => {
    preferences.choosePreset('confident-reading')
    preferences.customize({ questionLength })
    preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
    preferences.customize({ keySignatures })
    preferences.customize({ accidentals })
    if (showAnswerAtOnce) preferences.chooseShowAnswerAtOnce(true)
    if (naming) preferences.chooseNoteNaming(naming)
  })
  const wiki = fakeWikiLibrary(loading)
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
    library: wiki.library,
  })
  await chooseLength(TEXTS[locale].noLimit)
  return wiki
}

// The values in turn, then 0.
function sequence(...values: number[]): Random {
  const queue = [...values]
  return { next: () => queue.shift() ?? 0 }
}

// The questions of accidentals.spec.ts and key-signatures.spec.ts.
// F4, a quarter, with a sharp before it: fa♯ in the 1st space.
const FA_SHARP = () => sequence(3.5 / 12, 0.5, 0.9, 0)
// F5, a quarter, in a key of one sharp, no sign before it: fa♯ on the 5th line.
const FA_SHARP_IN_KEY = () => sequence(10.5 / 12, 0.5, 0.5, 0, 0)
// B4, a quarter, in a key of one flat, no sign before it: si♭ on the 3rd line.
const SI_FLAT_IN_KEY = () => sequence(6.5 / 12, 0.5, 0.5, 0.5, 0)
// Three quarters, F4, G4 and F4, a sharp before the first F4 lasting to the second.
const FA_SHARP_SOL_FA = () =>
  sequence(0.5, 3.5 / 12, 0.5, 3.5 / 11, 0.5, 3.5 / 11, 0.5, 0.9, 0, 0, 0.9)
// The same with a flat.
const FA_FLAT_SOL_FA = () =>
  sequence(0.5, 3.5 / 12, 0.5, 3.5 / 11, 0.5, 3.5 / 11, 0.5, 0.9, 0.5, 0, 0)
// FA_SHARP_SOL_FA with naturals allowed: a natural before the second F4.
const FA_SHARP_SOL_FA_NATURAL = FA_SHARP_SOL_FA
// F5, a quarter, one sharp in the key signature, a natural before the note: fa on the 5th line.
const FA_NATURAL_IN_KEY = () => sequence(10.5 / 12, 0.5, 0.5, 0, 0.9)

const SEVERAL = { questionLength: 'two-to-four-notes' } as const
const NATURALS = { accidentals: 'sharp-flat-and-natural' } as const
const KEY_SIGNS = { keySignatures: 2, ...NATURALS } as const

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

async function pressAll(names: readonly string[]) {
  for (const name of names) await press(name)
}

const whyButtons = (name: string = EN.why) => screen.queryAllByRole('button', { name })

function why(index = 0, name: string = EN.why) {
  const button = whyButtons(name)[index]
  if (!button) throw new Error(`there is no button ${name} number ${index + 1}`)
  return button
}

const describedBy = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id))
    .filter((each): each is HTMLElement => each !== null)

const descriptionOf = (element: HTMLElement) =>
  describedBy(element)
    .map((each) => each.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .join(' ')
    .trim()

const hint = () => screen.getByRole('dialog')
const inHint = () => within(hint())

async function openHint(index = 0, name: string = EN.why) {
  await fireEvent.click(why(index, name))
  return screen.findByRole('dialog')
}

async function closeHint(name: string = EN.close) {
  await fireEvent.click(inHint().getByRole('button', { name }))
}

// The hint text has markup in it, so it is matched on the whole text of the innermost element
// that holds all of it.
const shown = (text: string) => (_: string, element: Element | null) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() === text &&
  ![...element.children].some((child) => child.textContent?.replace(/\s+/g, ' ').trim() === text)

const hintTitle = () => inHint().getByRole('heading').textContent?.trim()

const staffPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')
const progress = () => screen.getByText(/^Points:/).textContent

const isBefore = (first: Node, second: Node) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

interface Review {
  readonly name: string
  readonly random: () => Random
  readonly setup?: Setup
  readonly answer: readonly string[]
  readonly sentences: readonly (readonly [string, Topic])[]
}

const REVIEWS: readonly Review[] = [
  {
    name: 'a wrong note',
    random: FA_SHARP,
    answer: ['fa', '1/4', 'Check'],
    sentences: [['You chose fa. This is fa sharp: the note in the 1st space.', 'treble-staff']],
  },
  {
    name: 'a note that sounds the same',
    random: FA_SHARP,
    answer: ['Flat', 'sol', '1/4', 'Check'],
    sentences: [
      ['You chose sol flat. This is fa sharp: the note in the 1st space.', 'treble-staff'],
      ['sol flat sounds the same as fa sharp, but this note is written on fa.', 'accidentals'],
    ],
  },
  {
    name: 'a sharp from the key signature',
    random: FA_SHARP_IN_KEY,
    setup: { keySignatures: 2 },
    answer: ['fa', '1/4', 'Check'],
    sentences: [
      ['You chose fa. This is fa sharp: the note on the 5th line.', 'treble-staff'],
      ['The sharp comes from the key signature.', 'key-signatures'],
    ],
  },
  {
    name: 'a flat from the key signature',
    random: SI_FLAT_IN_KEY,
    setup: { keySignatures: 2 },
    answer: ['si', '1/4', 'Check'],
    sentences: [
      ['You chose si. This is si flat: the note on the 3rd line.', 'treble-staff'],
      ['The flat comes from the key signature.', 'key-signatures'],
    ],
  },
  {
    name: 'a sharp from earlier in the bar',
    random: FA_SHARP_SOL_FA,
    setup: SEVERAL,
    answer: ['Sharp', 'fa', '1/4', 'sol', '1/4', 'fa', '1/4', 'Check'],
    sentences: [
      ['You chose fa. This is fa sharp: the note in the 1st space.', 'treble-staff'],
      ['The sharp comes from the sharp earlier in the bar.', 'accidentals'],
    ],
  },
  {
    name: 'a flat from earlier in the bar',
    random: FA_FLAT_SOL_FA,
    setup: SEVERAL,
    answer: ['Flat', 'fa', '1/4', 'sol', '1/4', 'fa', '1/4', 'Check'],
    sentences: [
      ['You chose fa. This is fa flat: the note in the 1st space.', 'treble-staff'],
      ['The flat comes from the flat earlier in the bar.', 'accidentals'],
    ],
  },
  {
    name: 'a natural cancelling the key signature',
    random: FA_NATURAL_IN_KEY,
    setup: KEY_SIGNS,
    answer: ['Sharp', 'fa', '1/4', 'Check'],
    sentences: [
      ['You chose fa sharp. This is fa: the note on the 5th line.', 'treble-staff'],
      ['The natural cancels the sharp in the key signature.', 'key-signatures'],
    ],
  },
  {
    name: 'a natural cancelling a sign earlier in the bar',
    random: FA_SHARP_SOL_FA_NATURAL,
    setup: { ...SEVERAL, ...NATURALS },
    answer: ['Sharp', 'fa', '1/4', 'sol', '1/4', 'Sharp', 'fa', '1/4', 'Check'],
    sentences: [
      ['You chose fa sharp. This is fa: the note in the 1st space.', 'treble-staff'],
      ['The natural cancels the sharp earlier in the bar.', 'accidentals'],
    ],
  },
  {
    name: 'a wrong duration',
    random: FA_NATURAL_IN_KEY,
    setup: KEY_SIGNS,
    answer: ['fa', '1/2', 'Check'],
    sentences: [['You chose a half note. This is a quarter note.', 'durations']],
  },
  {
    name: 'a wrong note and a wrong duration',
    random: FA_SHARP,
    answer: ['Flat', 'sol', '1/2', 'Check'],
    sentences: [
      ['You chose sol flat. This is fa sharp: the note in the 1st space.', 'treble-staff'],
      ['sol flat sounds the same as fa sharp, but this note is written on fa.', 'accidentals'],
      ['You chose a half note. This is a quarter note.', 'durations'],
    ],
  },
]

describe.each(REVIEWS)('the review of $name', ({ random, setup, answer, sentences }) => {
  it('keeps its text, with a Why? for each sentence', async () => {
    await renderTrainer(random(), setup)

    await pressAll(answer)

    expect(statusText()).toMatch(new RegExp(`${escape(sentences.map(([text]) => text))}$`))
    expect(whyButtons()).toHaveLength(sentences.length)
  })

  it('describes each Why? by its sentence and puts it right after it', async () => {
    await renderTrainer(random(), setup)

    await pressAll(answer)

    const buttons = whyButtons()
    expect(buttons.map(descriptionOf)).toEqual(
      sentences.map(([text]) => expect.stringContaining(text)),
    )
    buttons.forEach((button, index) => {
      const [sentence] = describedBy(button)
      const [next] = describedBy(buttons[index + 1] ?? button)
      expect(sentence && isBefore(sentence, button)).toBe(true)
      expect(next === sentence || (next !== undefined && isBefore(button, next))).toBe(true)
    })
  })

  it('opens the hint of the topic of each sentence', async () => {
    await renderTrainer(random(), setup)
    await pressAll(answer)

    const titles: (string | undefined)[] = []
    for (const index of sentences.keys()) {
      await openHint(index)
      titles.push(hintTitle())
      await closeHint()
    }

    expect(titles).toEqual(sentences.map(([, topic]) => TITLES[topic]))
  })
})

function escape(texts: readonly string[]) {
  return texts.map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(' ')
}

// With several notes each wrong note keeps its number before its sentences, and every sentence its
// own Why?.
describe('the review of several wrong notes', () => {
  // FA_SHARP_SOL_FA answered fa♯, la, fa: the 2nd and the 3rd notes are wrong.
  async function answerTwoWrong() {
    await renderTrainer(FA_SHARP_SOL_FA(), SEVERAL)
    await pressAll(['Sharp', 'fa', '1/4', 'la', '1/4', 'fa', '1/4', 'Check'])
  }

  it('keeps its text with the numbers of the notes', async () => {
    await answerTwoWrong()

    expect(statusText()).toBe(
      'Note 2: You chose la. This is sol: the note on the 2nd line. Note 3: You chose fa. This is fa sharp: the note in the 1st space. The sharp comes from the sharp earlier in the bar.',
    )
  })

  it('has a Why? for every sentence of every note, in their order', async () => {
    await answerTwoWrong()

    expect(whyButtons().map(descriptionOf)).toEqual([
      expect.stringContaining('You chose la. This is sol: the note on the 2nd line.'),
      expect.stringContaining('You chose fa. This is fa sharp: the note in the 1st space.'),
      expect.stringContaining('The sharp comes from the sharp earlier in the bar.'),
    ])
    const [first, second] = whyButtons()
    expect(first && second && isBefore(first, screen.getByText(/Note 3:/))).toBe(true)
  })

  it('opens the hint of each sentence', async () => {
    await answerTwoWrong()

    const titles: (string | undefined)[] = []
    for (const index of [0, 1, 2]) {
      await openHint(index)
      titles.push(hintTitle())
      await closeHint()
    }

    expect(titles).toEqual([TITLES['treble-staff'], TITLES['treble-staff'], TITLES.accidentals])
  })
})

describe('no Why?', () => {
  it('after a right answer', async () => {
    await renderTrainer(FA_SHARP())

    await pressAll(['Sharp', 'fa', '1/4', 'Check'])

    expect(statusText()).toBe('Correct')
    expect(whyButtons()).toEqual([])
  })

  it('after a wrong first attempt, which only says to try again', async () => {
    await renderTrainer(FA_SHARP(), { showAnswerAtOnce: false })

    await pressAll(['fa', '1/4', 'Check'])

    expect(statusText()).toBe('Incorrect. Try again.')
    expect(whyButtons()).toEqual([])
  })

  it('with the message to choose a name first', async () => {
    await renderTrainer(FA_SHARP())

    await press('Check')

    expect(statusText()).toBe('Choose a note name and a duration')
    expect(whyButtons()).toEqual([])
  })

  it('after a right second attempt', async () => {
    await renderTrainer(FA_SHARP(), { showAnswerAtOnce: false })
    await pressAll(['fa', '1/4', 'Check'])

    await pressAll(['Sharp', 'fa', 'Check'])

    expect(statusText()).toBe('Correct on the second try')
    expect(whyButtons()).toEqual([])
  })

  it('on the next question', async () => {
    await renderTrainer(FA_SHARP())
    await pressAll(['fa', '1/4', 'Check'])

    await press('Next')

    expect(whyButtons()).toEqual([])
  })
})

it('gives a Why? to the review of a wrong second attempt', async () => {
  await renderTrainer(FA_SHARP(), { showAnswerAtOnce: false })
  await pressAll(['fa', '1/4', 'Check'])

  await pressAll(['sol', 'Check'])

  expect(statusText()).toBe('You chose sol. This is fa sharp: the note in the 1st space.')
  expect(whyButtons()).toHaveLength(1)
})

describe.each(['ru', 'es'] as const)('in %s', (locale) => {
  const texts = TEXTS[locale]
  const answer = [texts.flat, 'sol', '1/4', texts.check]

  async function openTheHint() {
    await renderTrainer(FA_SHARP(), { locale })
    await pressAll(answer)
    return openHint(0, texts.why)
  }

  it('Why? is said in the language of the interface', async () => {
    await renderTrainer(FA_SHARP(), { locale })

    await pressAll(answer)

    expect(whyButtons(texts.why)).toHaveLength(2)
    expect(whyButtons(EN.why)).toEqual([])
  })

  it('the hint is in the language of the interface', async () => {
    await openTheHint()

    expect(hintTitle()).toBe(texts.title)
    expect(await inHint().findByText(shown(hintText('treble-staff', locale)))).toBeTruthy()
    expect(inHint().getByRole('link', { name: texts.readArticle })).toBeTruthy()
    expect(inHint().getByRole('button', { name: texts.close })).toBeTruthy()
  })

  it('says it is loading and that it failed in the language of the interface', async () => {
    await renderTrainer(FA_SHARP(), { locale, loading: 'held' })
    await pressAll(answer)
    await openHint(0, texts.why)
    expect(inHint().getByText(texts.loading)).toBeTruthy()
    cleanup()
    forgetDialogs()

    await renderTrainer(FA_SHARP(), { locale, loading: 'failing' })
    await pressAll(answer)
    await openHint(0, texts.why)

    expect((await inHint().findByRole('alert')).textContent?.trim()).toBe(texts.loadError)
  })
})

// Criterion 8: the hint over the trainer.
describe('the hint', () => {
  // A wrong note and a wrong duration: three sentences, of the staff, of the signs and of the
  // durations.
  async function reviewThreeSentences(setup: Setup = {}) {
    const wiki = await renderTrainer(FA_SHARP(), setup)
    await pressAll(['Flat', 'sol', '1/2', 'Check'])
    return wiki
  }

  it('opens as a modal dialog named by the title of its topic', async () => {
    await reviewThreeSentences()

    const dialog = await openHint(0)

    expect(isOpenAsModal(dialog)).toBe(true)
    expect(screen.getByRole('dialog', { name: TITLES['treble-staff'] })).toBe(dialog)
    expect(hintTitle()).toBe(TITLES['treble-staff'])
  })

  it('takes the focus inside it', async () => {
    await reviewThreeSentences()

    const dialog = await openHint(0)

    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('loads the article of its topic in the language and the naming of the user', async () => {
    const wiki = await reviewThreeSentences()

    await openHint(2)

    expect(wiki.loads).toEqual([{ topic: 'durations', locale: 'en' }])
    expect(await inHint().findByText(shown(hintText('durations', 'en')))).toBeTruthy()
  })

  it('shows its text as HTML', async () => {
    await reviewThreeSentences()

    await openHint(1)

    const text = await inHint().findByText(shown(hintText('accidentals', 'en')))
    expect(text.querySelector('strong')?.textContent).toBe('accidentals')
  })

  it('names the notes in the naming of the user', async () => {
    await renderTrainer(FA_SHARP(), { naming: 'letter' })
    await pressAll(['F', '1/4', 'Check'])

    await openHint(0)

    expect(await inHint().findByText(shown(hintText('treble-staff', 'en', 'F♯')))).toBeTruthy()
  })

  it('shows its example on the staff, labelled', async () => {
    await reviewThreeSentences()

    await openHint(0)

    const example = await inHint().findByRole('img', { name: HINT_LABEL })
    expect(example.getAttribute('data-elements')).toBe('G4/whole')
  })

  it('links to the article of its topic', async () => {
    await reviewThreeSentences()

    await openHint(1)

    const link = await inHint().findByRole('link', { name: EN.readArticle })
    expect(link.getAttribute('href')).toBe('/wiki/accidentals')
  })

  it('leaves the question, its review and the score as they were', async () => {
    await reviewThreeSentences()
    const review = statusText()
    const score = progress()

    await openHint(0)
    await inHint().findByText(shown(hintText('treble-staff', 'en')))

    expect(staffPitch()).toBe('F#4')
    expect(statusText()).toBe(review)
    expect(progress()).toBe(score)
    expect(screen.getByText('Question 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
  })

  it('leaves the question as it was once closed', async () => {
    await reviewThreeSentences()
    const review = statusText()
    const score = progress()
    await openHint(0)

    await closeHint()

    expect(staffPitch()).toBe('F#4')
    expect(statusText()).toBe(review)
    expect(progress()).toBe(score)
    expect(whyButtons()).toHaveLength(3)
  })

  describe('while its article loads', () => {
    it('shows its title and Loading… in place of the text', async () => {
      await reviewThreeSentences({ loading: 'held' })

      await openHint(0)

      expect(hintTitle()).toBe(TITLES['treble-staff'])
      expect(inHint().getByText(EN.loading)).toBeTruthy()
      expect(inHint().queryByText(shown(hintText('treble-staff', 'en')))).toBeNull()
      expect(inHint().queryByRole('img')).toBeNull()
    })

    it('shows the text and the example once loaded', async () => {
      const wiki = await reviewThreeSentences({ loading: 'held' })
      await openHint(0)

      wiki.release()

      expect(await inHint().findByText(shown(hintText('treble-staff', 'en')))).toBeTruthy()
      expect(inHint().getByRole('img', { name: HINT_LABEL })).toBeTruthy()
      expect(inHint().queryByText(EN.loading)).toBeNull()
    })

    it('closes with Close', async () => {
      await reviewThreeSentences({ loading: 'held' })
      await openHint(0)

      await closeHint()

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(why(0))
    })
  })

  describe('whose article fails to load', () => {
    it('says so in an alert, under its title', async () => {
      await reviewThreeSentences({ loading: 'failing' })

      await openHint(0)

      const alert = await inHint().findByRole('alert')
      expect(alert.textContent?.trim()).toBe(EN.loadError)
      expect(hintTitle()).toBe(TITLES['treble-staff'])
      expect(inHint().queryByText(EN.loading)).toBeNull()
    })

    it('closes with Close, the focus back on its Why?', async () => {
      await reviewThreeSentences({ loading: 'failing' })
      await openHint(1)
      await inHint().findByRole('alert')

      await closeHint()

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(why(1))
    })
  })
})

// Criterion 11.
describe('closing the hint', () => {
  async function openSecondHint() {
    await renderTrainer(FA_SHARP())
    await pressAll(['Flat', 'sol', '1/2', 'Check'])
    const dialog = await openHint(1)
    await inHint().findByText(shown(hintText('accidentals', 'en')))
    return dialog
  }

  it('is done with Close, the focus back on the Why? that opened it', async () => {
    await openSecondHint()

    await closeHint()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(why(1))
  })

  it('is done with Esc, the focus back on the Why? that opened it', async () => {
    await openSecondHint()

    await pressEscape()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(why(1))
  })

  it('is done with a press outside it, the focus back on the Why? that opened it', async () => {
    const dialog = await openSecondHint()

    await pressOutside(dialog)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(why(1))
  })

  it('is not done by a press inside it off the controls', async () => {
    await openSecondHint()

    await fireEvent.click(inHint().getByText(shown(hintText('accidentals', 'en'))))
    await fireEvent.click(inHint().getByRole('img', { name: HINT_LABEL }))
    await fireEvent.click(inHint().getByRole('heading'))

    expect(isOpenAsModal(hint())).toBe(true)
  })

  it('lets another Why? open its own hint, the focus back on that one', async () => {
    await openSecondHint()
    await closeHint()

    await openHint(2)
    expect(hintTitle()).toBe(TITLES.durations)
    expect(await inHint().findByText(shown(hintText('durations', 'en')))).toBeTruthy()
    await pressEscape()

    await waitFor(() => expect(document.activeElement).toBe(why(2)))
  })

  it('lets the same Why? open it again', async () => {
    await openSecondHint()
    await pressEscape()

    const dialog = await openHint(1)

    expect(isOpenAsModal(dialog)).toBe(true)
    expect(hintTitle()).toBe(TITLES.accidentals)
  })
})
