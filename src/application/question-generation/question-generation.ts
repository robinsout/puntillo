import type { Random } from '@/application/ports'
import type { Pitch } from '@/domain/pitch'
import { diatonicPitchesBetween, isSamePitch } from '@/domain/pitch'
import type { Question } from '@/domain/question'
import { createQuestion, DURATION_VALUES } from '@/domain/question'

const RANGE = diatonicPitchesBetween({ letter: 'C', octave: 4 }, { letter: 'C', octave: 5 })

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random.next() * items.length)]
  if (item === undefined) throw new Error('Random source must return a number in [0, 1)')
  return item
}

export function createQuestionGenerator(random: Random): () => Question {
  let previous: Pitch | undefined

  return () => {
    const candidates = RANGE.filter((pitch) => !previous || !isSamePitch(pitch, previous))
    const pitch = pick(candidates, random)
    previous = pitch
    return createQuestion({ pitch, duration: { value: pick(DURATION_VALUES, random) } })
  }
}
