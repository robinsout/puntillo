import type { StaffLayout } from '@/infrastructure/notation'

// A type, not an interface, so that it passes as a style.
export type NoteBox = {
  readonly left: string
  readonly width: string
  readonly top: string
  readonly height: string
}

// Each box spans halfway to its neighbouring notes and rests on its line, the outer ones as far
// out as in, and the height of its line. A note alone on its line takes the whole line. No box
// covers the clef, the time signature or a rest.
export function noteBoxes({ notes, rests, lines }: StaffLayout): NoteBox[] {
  return notes.map(({ x, line }) => {
    const others = [...notes, ...rests].filter((each) => each.line === line).map((each) => each.x)
    const before = Math.max(...others.filter((each) => each < x))
    const after = Math.min(...others.filter((each) => each > x))
    const toLeft = Number.isFinite(before) ? (x - before) / 2 : undefined
    const toRight = Number.isFinite(after) ? (after - x) / 2 : undefined
    const band = lines[line] ?? { left: 0, top: 0, bottom: 1 }
    const left = Math.max(band.left, x - (toLeft ?? toRight ?? 1))
    const right = Math.min(1, x + (toRight ?? toLeft ?? 1))
    return {
      left: `${left * 100}%`,
      width: `${(right - left) * 100}%`,
      top: `${band.top * 100}%`,
      height: `${(band.bottom - band.top) * 100}%`,
    }
  })
}
