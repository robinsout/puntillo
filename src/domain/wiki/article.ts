import type { Difficulty } from '../difficulty'
import type { Question } from '../question'
import type { WikiTopic } from './topics'

export type ArticleBlock =
  | { readonly kind: 'text'; readonly html: string }
  | { readonly kind: 'staff'; readonly label: string; readonly question: Question }

export interface WikiArticle {
  readonly practice: Difficulty
  readonly related: readonly WikiTopic[]
  readonly blocks: readonly ArticleBlock[]
}
