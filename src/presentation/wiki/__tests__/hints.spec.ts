import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import { renderApp } from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { createMemoryStorage, preferencesFor, statusText } from '@/presentation/__tests__/screen'

// Feature wiki, slice 3, criterion 9 and edge case 3: Read the article in a hint opens the article
// in place of the trainer. While a session is on a question, every screen of the wiki offers Back to
// the question, which brings back the same question with the same review, the focus on the Why?
// that opened the hint; the article then offers no Practice this, which would replace the session.
// Without a session on a question — opened from the choice screen, or after a reload, which starts
// the page anew — there is no Back to the question and Practice this is offered as before.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    back: 'Back to the question',
    why: 'Why?',
    readArticle: 'Read the article',
    noLimit: 'No limit',
    check: 'Check',
    flat: 'Flat',
    practice: 'Practice this',
    accidentals: 'Sharp, flat and natural',
  },
  ru: {
    back: 'Вернуться к вопросу',
    why: 'Почему?',
    readArticle: 'Читать статью',
    noLimit: 'Без ограничения',
    check: 'Проверить',
    flat: 'Бемоль',
    practice: 'Потренировать это',
    accidentals: 'Диез, бемоль и бекар',
  },
  es: {
    back: 'Volver a la pregunta',
    why: '¿Por qué?',
    readArticle: 'Leer el artículo',
    noLimit: 'Sin límite',
    check: 'Comprobar',
    flat: 'Bemol',
    practice: 'Practicar esto',
    accidentals: 'Sostenido, bemol y becuadro',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en
const KEY_SIGNATURES_TITLE = 'Key signatures'

// As in accidentals.spec.ts: Confident reading with one note in 4/4, with sharps and flats, the
// right answer shown at once.
function oneNoteWithSigns(): KeyValueStorage {
  const storage = createMemoryStorage()
  const preferences = createPreferences(storage, ['en'])
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'sharp-and-flat' })
  preferences.chooseShowAnswerAtOnce(true)
  return storage
}

// F4, a quarter, with a sharp before it: fa♯ in the 1st space; then plain whole notes.
function faSharp(): Random {
  const queue = [3.5 / 12, 0.5, 0.9, 0]
  return { next: () => queue.shift() ?? 0 }
}

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const link = (name: string) => screen.getByRole('link', { name })
const findHeading = (name: string) => screen.findByRole('heading', { level: 1, name })
const whyButtons = (name: string = EN.why) => screen.queryAllByRole('button', { name })

// Back to the question may be a link or a button: it is one or the other, once.
const backsToQuestion = (name: string = EN.back) => [
  ...screen.queryAllByRole('link', { name }),
  ...screen.queryAllByRole('button', { name }),
]

function backToQuestion(name: string = EN.back) {
  const found = backsToQuestion(name)
  if (found.length !== 1) throw new Error(`expected one ${name}, found ${found.length}`)
  return found[0] as HTMLElement
}

const staffPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')
const progress = () => screen.getByText(/^(Points|Баллы|Puntos):/).textContent

interface Question {
  readonly review: string
  readonly progress: string | null
}

// A session of No limit on fa♯ answered sol♭ and a half note: three sentences, of the staff, of the
// signs and of the durations, each with its Why?.
async function reviewThreeSentences(locale: Locale = 'en') {
  const texts = TEXTS[locale]
  const app = await renderApp({
    locale,
    preferences: preferencesFor([locale], oneNoteWithSigns()),
    random: faSharp(),
  })
  await press(texts.noLimit)
  for (const name of [texts.flat, 'sol', '1/2', texts.check]) await press(name)
  const question: Question = { review: statusText(), progress: progress() }
  return { ...app, question }
}

// Opens the hint of the second sentence, of the signs, and its article.
async function readSecondArticle(locale: Locale = 'en') {
  const texts = TEXTS[locale]
  const visit = await reviewThreeSentences(locale)
  await fireEvent.click(whyButtons(texts.why)[1] as HTMLElement)
  const dialog = await screen.findByRole('dialog')
  await fireEvent.click(within(dialog).getByRole('link', { name: texts.readArticle }))
  await findHeading(texts.accidentals)
  await screen.findByText(`About accidentals in ${locale}.`)
  return visit
}

async function expectSameQuestion(question: Question) {
  expect(await findHeading('Name the note')).toBeTruthy()
  expect(staffPitch()).toBe('F#4')
  expect(statusText()).toBe(question.review)
  expect(progress()).toBe(question.progress)
  expect(screen.getByText('Question 1')).toBeTruthy()
  expect(whyButtons()).toHaveLength(3)
  expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
}

describe('Read the article', () => {
  it('opens the article of the hint in place of the trainer', async () => {
    const { router } = await readSecondArticle()

    expect(router.currentRoute.value.path).toBe('/wiki/accidentals')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('img', { name: 'Music staff' })).toBeNull()
  })

  it('opens an article with Back to the question and without Practice this', async () => {
    await readSecondArticle()

    expect(backToQuestion()).toBeTruthy()
    expect(screen.queryByRole('button', { name: EN.practice })).toBeNull()
  })
})

describe('Back to the question', () => {
  it('brings back the same question with the same review', async () => {
    const { question } = await readSecondArticle()

    await fireEvent.click(backToQuestion())

    await expectSameQuestion(question)
  })

  it('goes to the trainer', async () => {
    const { router } = await readSecondArticle()

    await fireEvent.click(backToQuestion())

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
  })

  it('puts the focus on the Why? that opened the hint', async () => {
    await readSecondArticle()

    await fireEvent.click(backToQuestion())

    await findHeading('Name the note')
    await waitFor(() => expect(document.activeElement).toBe(whyButtons()[1]))
  })

  it('lets the question go on', async () => {
    await readSecondArticle()
    await fireEvent.click(backToQuestion())
    await findHeading('Name the note')

    await press('Next')

    expect(screen.getByText('Question 2')).toBeTruthy()
    expect(whyButtons()).toEqual([])
  })

  it('stays on a related article, and brings back the same question from there', async () => {
    const { question } = await readSecondArticle()

    await fireEvent.click(link(KEY_SIGNATURES_TITLE))
    await findHeading(KEY_SIGNATURES_TITLE)
    await screen.findByText('About key-signatures in en.')

    expect(screen.queryByRole('button', { name: EN.practice })).toBeNull()
    await fireEvent.click(backToQuestion())
    await expectSameQuestion(question)
    await waitFor(() => expect(document.activeElement).toBe(whyButtons()[1]))
  })

  it('stays on the list of topics, and brings back the same question from there', async () => {
    const { question } = await readSecondArticle()

    await fireEvent.click(link('Wiki'))
    await findHeading('Wiki')

    await fireEvent.click(backToQuestion())
    await expectSameQuestion(question)
  })

  it.each(['ru', 'es'] as const)('is said in %s', async (locale) => {
    await readSecondArticle(locale)

    expect(backToQuestion(TEXTS[locale].back)).toBeTruthy()
    expect(backsToQuestion(EN.back)).toEqual([])
    expect(screen.queryByRole('button', { name: TEXTS[locale].practice })).toBeNull()
  })

  it('opens the hint again from the review it brings back', async () => {
    await readSecondArticle()
    await fireEvent.click(backToQuestion())
    await findHeading('Name the note')

    await fireEvent.click(whyButtons()[2] as HTMLElement)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading').textContent?.trim()).toBe(
      'Durations of notes and rests',
    )
  })
})

// Edge case 3.
describe('without a session on a question', () => {
  it('the article has no Back to the question and offers Practice this', async () => {
    await renderApp({ path: '/wiki/accidentals' })

    await screen.findByText('About accidentals in en.')

    expect(backsToQuestion()).toEqual([])
    expect(screen.getByRole('button', { name: EN.practice })).toBeTruthy()
  })

  it('the list has no Back to the question', async () => {
    await renderApp({ path: '/wiki' })

    expect(backsToQuestion()).toEqual([])
  })

  it('the wiki opened from the choice screen has no Back to the question', async () => {
    await renderApp()

    await fireEvent.click(link('Wiki'))
    await findHeading('Wiki')
    expect(backsToQuestion()).toEqual([])
    await fireEvent.click(link(EN.accidentals))
    await screen.findByText('About accidentals in en.')

    expect(backsToQuestion()).toEqual([])
    expect(screen.getByRole('button', { name: EN.practice })).toBeTruthy()
  })

  it('a reload on the article leaves no Back to the question: the session is not kept', async () => {
    const storage = oneNoteWithSigns()
    await readSecondArticle()
    cleanup()

    await renderApp({ path: '/wiki/accidentals', preferences: preferencesFor(['en'], storage) })
    await screen.findByText('About accidentals in en.')

    expect(backsToQuestion()).toEqual([])
    expect(screen.getByRole('button', { name: EN.practice })).toBeTruthy()
  })

  it('the article after Finish has no Back to the question', async () => {
    await readSecondArticle()
    await fireEvent.click(backToQuestion())
    await findHeading('Name the note')
    await press('Finish')
    await findHeading('Results')
    await press('New session')
    await findHeading('How many questions?')

    await fireEvent.click(link('Wiki'))
    await findHeading('Wiki')

    expect(backsToQuestion()).toEqual([])
  })
})
