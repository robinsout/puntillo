import { isSameItem, type ReviewItem } from '../review-queue'

export interface ItemStats {
  readonly item: ReviewItem
  readonly shown: number
  // Of the first attempts, as Most mistakes.
  readonly mistakes: number
  // Epoch milliseconds.
  readonly lastShownAt: number
  readonly lastRight: boolean
}

export interface ItemAnswer {
  readonly item: ReviewItem
  readonly right: boolean
}

// A plain value, so that it is kept as JSON. The items are in the order they were last recorded
// in: of two shown at the same time, the later one is the later recorded.
export interface ItemStatistics {
  readonly items: readonly ItemStats[]
}

export const NO_STATISTICS: ItemStatistics = { items: [] }

const HARDEST_NOTES = 10

export function recordAnswers(
  statistics: ItemStatistics,
  answers: readonly ItemAnswer[],
  at: number,
): ItemStatistics {
  return answers.reduce<ItemStatistics>(({ items }, { item, right }) => {
    const recorded = items.find((each) => isSameItem(each.item, item))
    const others = items.filter((each) => each !== recorded)
    return {
      items: [
        ...others,
        {
          item,
          shown: (recorded?.shown ?? 0) + 1,
          mistakes: (recorded?.mistakes ?? 0) + (right ? 0 : 1),
          lastShownAt: at,
          lastRight: right,
        },
      ],
    }
  }, statistics)
}

export const hardestNotes = (
  { items }: ItemStatistics,
  limit = HARDEST_NOTES,
): readonly ItemStats[] =>
  items
    .map((stats, recorded) => ({ stats, recorded }))
    .filter(({ stats }) => stats.mistakes > 0)
    .sort(
      (one, other) =>
        other.stats.mistakes - one.stats.mistakes ||
        other.stats.lastShownAt - one.stats.lastShownAt ||
        other.recorded - one.recorded,
    )
    .slice(0, limit)
    .map(({ stats }) => stats)
