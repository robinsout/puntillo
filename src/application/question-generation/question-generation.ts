import type { Random } from '@/application/ports'
import type { Difficulty } from '@/domain/difficulty'
import { allowedPitches, noteCounts } from '@/domain/difficulty'
import type { Pitch } from '@/domain/pitch'
import { isSamePitch } from '@/domain/pitch'
import type { Duration, Note, Question } from '@/domain/question'
import { barSixteenths, COMMON_TIME, createQuestion, sixteenths } from '@/domain/question'

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random.next() * items.length)]
  if (item === undefined) throw new Error('Random source must return a number in [0, 1)')
  return item
}

export function createQuestionGenerator(random: Random, difficulty: Difficulty): () => Question {
  const pitches = allowedPitches(difficulty)
  const bar = barSixteenths(COMMON_TIME)
  const shortest = Math.min(...difficulty.durations.map(sixteenths))
  const offeredCounts = noteCounts(difficulty.questionLength)
  const counts = offeredCounts.filter((count) => count * shortest <= bar)
  let previous: Pitch | undefined

  const nextPitch = (): Pitch => {
    const pitch = pick(
      pitches.filter((candidate) => !previous || !isSamePitch(candidate, previous)),
      random,
    )
    previous = pitch
    return pitch
  }

  // Each duration leaves room for the notes after it, at the shortest duration each.
  const nextDuration = (room: number, notesAfter: number): Duration['value'] =>
    pick(
      difficulty.durations.filter((value) => sixteenths(value) + notesAfter * shortest <= room),
      random,
    )

  return () => {
    const count = offeredCounts.length > 1 ? pick(counts, random) : offeredCounts[0]
    const notes: Note[] = []
    let room = bar
    for (let index = 0; index < count; index++) {
      const pitch = nextPitch()
      const value = nextDuration(room, count - index - 1)
      room -= sixteenths(value)
      notes.push({ pitch, duration: { value } })
    }
    const [first, ...rest] = notes as [Note, ...Note[]]
    return createQuestion(first, ...rest)
  }
}
