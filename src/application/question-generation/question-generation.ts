import type { Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

export function generateQuestion(): Question {
  return createQuestion({ pitch: { letter: 'C', octave: 4 }, duration: { value: 'whole' } })
}
