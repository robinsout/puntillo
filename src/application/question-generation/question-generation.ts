import type { Random } from '@/application/ports'
import type { Difficulty } from '@/domain/difficulty'
import { allowedPitches } from '@/domain/difficulty'
import type { Pitch } from '@/domain/pitch'
import { isSamePitch } from '@/domain/pitch'
import type { Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random.next() * items.length)]
  if (item === undefined) throw new Error('Random source must return a number in [0, 1)')
  return item
}

export function createQuestionGenerator(random: Random, difficulty: Difficulty): () => Question {
  const pitches = allowedPitches(difficulty)
  let previous: Pitch | undefined

  return () => {
    const candidates = pitches.filter((pitch) => !previous || !isSamePitch(pitch, previous))
    const pitch = pick(candidates, random)
    previous = pitch
    return createQuestion({ pitch, duration: { value: pick(difficulty.durations, random) } })
  }
}
