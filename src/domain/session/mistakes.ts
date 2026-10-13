import { isSameItem, type ReviewItem } from '../review-queue'
import { inMistakeOrder, type WikiTopic } from '../wiki'

export interface Mistake {
  readonly item: ReviewItem
  readonly topics: readonly WikiTopic[]
}

export interface ItemMistakes {
  readonly item: ReviewItem
  readonly count: number
  readonly topics: readonly WikiTopic[]
}

interface Entry extends ItemMistakes {
  // The number of the last mistake on the item, counted over the session.
  readonly last: number
}

export interface Mistakes {
  readonly made: number
  readonly entries: readonly Entry[]
}

export const NO_MISTAKES: Mistakes = { made: 0, entries: [] }

const MOST_MISTAKES = 5

export function recordMistakes(mistakes: Mistakes, made: readonly Mistake[]): Mistakes {
  return made.reduce<Mistakes>(({ made: before, entries }, { item, topics }) => {
    const last = before + 1
    const entry = entries.find((each) => isSameItem(each.item, item))
    const others = entries.filter((each) => each !== entry)
    return {
      made: last,
      entries: [
        ...others,
        {
          item,
          count: (entry?.count ?? 0) + 1,
          topics: inMistakeOrder([...(entry?.topics ?? []), ...topics]),
          last,
        },
      ],
    }
  }, mistakes)
}

export const mostMistakes = ({ entries }: Mistakes): ItemMistakes[] =>
  [...entries]
    .sort((one, other) => other.count - one.count || other.last - one.last)
    .slice(0, MOST_MISTAKES)
    .map(({ item, count, topics }) => ({ item, count, topics }))
