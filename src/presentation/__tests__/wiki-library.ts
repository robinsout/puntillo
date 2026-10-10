import type { NoteNamingChoice, WikiLibrary } from '@/application/ports'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import { noteName } from '@/domain/naming'
import { parseStaffExample, type WikiArticle, type WikiTopic } from '@/domain/wiki'

// A wiki library standing in for the articles, for the wiki screens and the hints of the trainer.

// What Practice this of every fake article asks for: First steps, but the half and the eighth
// notes and their durations asked, so its session is told from one of First steps by its row.
export const PRACTICE: Difficulty = {
  ...presetDifficulty('first-steps'),
  durations: ['eighth', 'half'],
  askDuration: true,
}

export const EXAMPLE_LABEL = 'Two half notes'
export const HINT_LABEL = 'A whole note on the second line'

// The related topics of each fake article, as the real articles have them.
export const RELATED: Record<WikiTopic, WikiTopic[]> = {
  'treble-staff': ['durations', 'accidentals'],
  durations: ['treble-staff'],
  accidentals: ['key-signatures', 'treble-staff'],
  'key-signatures': ['accidentals', 'keys'],
  keys: ['key-signatures', 'accidentals'],
}

// The text of the hint as the dialog shows it: "Hint about accidentals in ru. The note fa♯."
export const hintText = (topic: WikiTopic, locale: Locale, sharp = 'fa♯') =>
  `Hint about ${topic} in ${locale}. The note ${sharp}.`

const textBlock = (text: string) => ({ kind: 'text' as const, html: `<p>${text}</p>`, text })

const example = (text: string) => {
  const question = parseStaffExample(text)
  if (!question) throw new Error(`the fake example ${text} does not parse`)
  return question
}

// The text tells in which language it was asked and names F♯4 as the real library would; one of
// its blocks is only in the article of its topic in its language: "About keys in ru.". So does
// the hint, with its topic in bold.
const articleIn = (topic: WikiTopic, locale: Locale, naming: NoteNamingChoice): WikiArticle => {
  const sharp = noteName('F', naming.noteNaming, naming.seventhNote, 1)
  return {
    practice: PRACTICE,
    related: RELATED[topic],
    blocks: [
      textBlock(`Article text in ${locale}.`),
      { kind: 'staff', label: EXAMPLE_LABEL, question: example('4/4 C5/half D5/half') },
      textBlock(`The note ${sharp}.`),
      textBlock(`About ${topic} in ${locale}.`),
    ],
    hint: {
      html: `Hint about <strong>${topic}</strong> in ${locale}. The note ${sharp}.`,
      label: HINT_LABEL,
      question: example('4/4 G4/whole'),
    },
  }
}

// 'ready' gives the article at once; 'held' only on release(); 'failing' never.
export type Loading = 'ready' | 'held' | 'failing'

export function fakeWikiLibrary(loading: Loading = 'ready') {
  const loads: { topic: WikiTopic; locale: Locale }[] = []
  const held: (() => void)[] = []
  const library: WikiLibrary = {
    load(topic, locale, naming) {
      loads.push({ topic, locale })
      const article = articleIn(topic, locale, naming)
      if (loading === 'failing') return Promise.reject(new Error('the network is down'))
      if (loading === 'ready') return Promise.resolve(article)
      return new Promise((resolve) => held.push(() => resolve(article)))
    },
  }
  return {
    library,
    loads,
    release() {
      for (const resolve of held.splice(0)) resolve()
    },
    // Gives the articles of the last count loads held, leaving the earlier ones held.
    releaseLast(count: number) {
      for (const resolve of held.splice(held.length - count)) resolve()
    },
  }
}
