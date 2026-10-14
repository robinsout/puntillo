export const NOTE_INPUTS = ['names', 'keyboard'] as const

export type NoteInput = (typeof NOTE_INPUTS)[number]

export const isNoteInput = (value: string): value is NoteInput =>
  (NOTE_INPUTS as readonly string[]).includes(value)
