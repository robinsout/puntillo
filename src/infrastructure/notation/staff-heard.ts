import type { Pitch } from '@/domain/pitch'
import { stepFromBottomLine, type Clef } from '@/domain/staff'
import type { HeardSign, StaffHeard } from './staff-marks'

const TOP_LINE_STEP = 8

// The steps of the ledger lines a head on this step needs, outside the staff.
export function ledgerSteps(step: number): number[] {
  const steps: number[] = []
  for (let line = -2; line >= step; line -= 2) steps.push(line)
  for (let line = TOP_LINE_STEP + 2; line <= step; line += 2) steps.push(line)
  return steps
}

// Where a heard note may stand, in units of the drawing, kept from the latest drawing of the staff.
// A column ends right of its note and of what goes with it at the height of the heads: its dots
// and its ghost.
export interface HeardPlaces {
  readonly clef: Clef
  readonly spacing: number
  readonly columns: readonly {
    readonly right: number
    readonly topLine: number
    readonly bottomLine: number
  }[]
}

interface Point {
  readonly x: number
  readonly y: number
}

export type HeardShape =
  | {
      readonly kind: 'note'
      readonly head: Point
      readonly sign: (Point & { readonly kind: HeardSign }) | null
      readonly ledgerLines: readonly {
        readonly x1: number
        readonly x2: number
        readonly y: number
      }[]
    }
  | {
      readonly kind: 'arrow'
      readonly stem: { readonly x: number; readonly y1: number; readonly y2: number }
      readonly head: readonly Point[]
    }

// In staff spaces. The widths are those of the glyphs of Bravura, noteheadBlack and the signs; a
// sign keeps a gap before its head as VexFlow's do, so the head moves by the width and the gap.
const GAP = 0.25
const HEAD_WIDTH = 1.18
const SIGN_ADVANCE: Record<HeardSign, number> = {
  sharp: 0.996 + GAP,
  flat: 0.9 + GAP,
  natural: 0.67 + GAP,
}
// A ledger line reaches this far beyond the head on each side.
export const LEDGER_OVERHANG = 0.4
const ARROW_LENGTH = 1.5
const ARROW_CLEARANCE = 0.5
const ARROW_HEAD_LENGTH = 0.6
const ARROW_HEAD_WIDTH = 0.8

function noteShape(
  pitch: Pitch,
  kind: HeardSign | undefined,
  { clef, spacing }: HeardPlaces,
  right: number,
  bottomLine: number,
): HeardShape {
  const step = stepFromBottomLine(pitch, clef)
  const yOf = (each: number) => bottomLine - (each * spacing) / 2
  const y = yOf(step)
  const sign = kind ? { kind, x: right + GAP * spacing, y } : null
  const headX = right + (GAP + (kind ? SIGN_ADVANCE[kind] : 0)) * spacing
  const centre = headX + (HEAD_WIDTH * spacing) / 2
  const half = (HEAD_WIDTH / 2 + LEDGER_OVERHANG) * spacing
  return {
    kind: 'note',
    head: { x: headX, y },
    sign,
    ledgerLines: ledgerSteps(step).map((line) => ({
      x1: centre - half,
      x2: centre + half,
      y: yOf(line),
    })),
  }
}

// An arrow points away from the staff: its base is near the staff, its head at the far end.
function arrowShape(beyond: 'up' | 'down', spacing: number, x: number, edge: number): HeardShape {
  const away = beyond === 'up' ? -1 : 1
  const base = edge + away * ARROW_CLEARANCE * spacing
  const tip = base + away * ARROW_LENGTH * spacing
  const headBase = tip - away * ARROW_HEAD_LENGTH * spacing
  const halfHead = (ARROW_HEAD_WIDTH * spacing) / 2
  return {
    kind: 'arrow',
    stem: { x, y1: base, y2: headBase },
    head: [
      { x: x - halfHead, y: headBase },
      { x: x + halfHead, y: headBase },
      { x, y: tip },
    ],
  }
}

export function heardShape(heard: StaffHeard, places: HeardPlaces): HeardShape | null {
  const column = places.columns[heard.column]
  if (!column) return null
  const { right, topLine, bottomLine } = column
  if ('pitch' in heard) return noteShape(heard.pitch, heard.sign, places, right, bottomLine)
  const x = right + (GAP + HEAD_WIDTH / 2) * places.spacing
  return arrowShape(heard.beyond, places.spacing, x, heard.beyond === 'up' ? topLine : bottomLine)
}
