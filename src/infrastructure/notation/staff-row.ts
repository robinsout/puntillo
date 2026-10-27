// What the difficulty may draw in a row of questions of one note. The row is laid out by it, not
// by the notes shown, so that a slot keeps its place when a note with a sign or a flag first comes.
export interface RowSlots {
  // The most signs of a key signature.
  readonly keySignatures: number
  // A sign before a note, of the key signature or an accidental.
  readonly signs: boolean
  readonly flags: boolean
}

// In units of the drawing.
export interface RowSizes {
  // The slot a note is given when there is room, and the narrowest it may be.
  readonly slot: number
  readonly minimum: number
  // Of a stave, from its left end to its right one, and before its first slot: the clef and the
  // most key signs.
  readonly staveRoom: number
  readonly signs: number
}

export interface RowPlan {
  readonly staves: number
  readonly perStave: number
  readonly slot: number
  readonly staveWidth: number
}

// Each note in a slot of its own, the slots as wide as each other, and a slot of room after the
// last one for the heard note. A row whose narrowest slots do not fit one stave is two, and a slot
// that does not fit then narrows down to its minimum rather than take a third.
export function rowPlan(length: number, { slot, minimum, staveRoom, signs }: RowSizes): RowPlan {
  const staves = signs + (length + 1) * minimum <= staveRoom ? 1 : 2
  const perStave = Math.ceil(length / staves)
  const fitting = (staveRoom - signs) / (perStave + 1)
  const fitted = Math.max(minimum, Math.min(slot, fitting))
  const staveWidth = Math.min(staveRoom, signs + (perStave + 1) * fitted)
  return { staves, perStave, slot: fitted, staveWidth }
}
