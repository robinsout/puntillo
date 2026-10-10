import type { Locale } from '@/domain/language'
import { matchesQuery, WIKI_TOPICS, type WikiArticle, type WikiTopic } from '@/domain/wiki'
import type { NoteNamingChoice, WikiLibrary } from '@/application/ports'

export interface TopicSearch {
  readonly query: string
  readonly locale: Locale
  readonly naming: NoteNamingChoice
  readonly titles: Readonly<Record<WikiTopic, string>>
}

const articleMatches = (article: WikiArticle, query: string) =>
  article.blocks.some((block) => block.kind === 'text' && matchesQuery(block.text, query))

// An article that fails to load is still found by its title: the search itself never fails.
export async function searchTopics(
  library: WikiLibrary,
  { query, locale, naming, titles }: TopicSearch,
): Promise<WikiTopic[]> {
  if (query.trim() === '') return [...WIKI_TOPICS]
  const found = await Promise.all(
    WIKI_TOPICS.map(async (topic) => {
      if (matchesQuery(titles[topic], query)) return true
      try {
        return articleMatches(await library.load(topic, locale, naming), query)
      } catch {
        return false
      }
    }),
  )
  return WIKI_TOPICS.filter((_, index) => found[index])
}
