import type { WikiLibrary } from '@/application/ports'

// Spec §18: each article and the Markdown parser are chunks of their own, loaded on opening.
const sources = import.meta.glob<string>('./articles/*.md', { query: '?raw', import: 'default' })

export function createWikiLibrary(): WikiLibrary {
  return {
    async load(topic, locale, naming) {
      const source = sources[`./articles/${topic}.${locale}.md`]
      if (!source) throw new Error(`There is no article ${topic} in ${locale}`)
      const [text, { parseArticle }] = await Promise.all([source(), import('./parse-article')])
      return parseArticle(text, naming)
    },
  }
}
