export const WIKI_TOPICS = [
  'treble-staff',
  'durations',
  'accidentals',
  'key-signatures',
  'keys',
] as const

export type WikiTopic = (typeof WIKI_TOPICS)[number]

export const isWikiTopic = (text: string): text is WikiTopic =>
  (WIKI_TOPICS as readonly string[]).includes(text)
