import type { Pitch } from '../pitch'

export interface Duration {
  value: 'whole'
}

export interface Note {
  pitch: Pitch
  duration: Duration
}

export interface TimeSignature {
  beats: number
  beatValue: number
}

export interface Question {
  clef: 'treble'
  timeSignature: TimeSignature
  note: Note
}

export function createQuestion(note: Note): Question {
  return { clef: 'treble', timeSignature: { beats: 4, beatValue: 4 }, note }
}
