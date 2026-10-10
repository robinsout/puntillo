export const WIKI_TOPICS = ['durations'] as const

export type WikiTopic = (typeof WIKI_TOPICS)[number]

export const isWikiTopic = (text: string): text is WikiTopic =>
  (WIKI_TOPICS as readonly string[]).includes(text)
