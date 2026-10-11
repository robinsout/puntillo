import { describe, expect, it } from 'vitest'
import { stepAt } from '@/infrastructure/notation'

// Feature m2-write-notes, criterion 5: a touch in the column writes the note on the nearest step,
// a line or a space. stepAt reads the step at a height of the drawing from where its top and
// bottom staff lines are drawn: steps are counted from the bottom line up, half a staff space each,
// as pitchAtStep counts them. Heights grow downwards, as on the screen.

// A staff from 30 down to 70: the staff space is 10, a step 5.
const STAFF = { topLine: 30, bottomLine: 70 }

describe('stepAt', () => {
  it.each([
    [70, 0],
    [65, 1],
    [60, 2],
    [50, 4],
    [30, 8],
  ])('reads the height %d as the step %d', (y, step) => {
    expect(stepAt(y, STAFF)).toBe(step)
  })

  it('takes the nearest step for a height between two steps', () => {
    expect(stepAt(61, STAFF)).toBe(2)
    expect(stepAt(58, STAFF)).toBe(2)
    expect(stepAt(63, STAFF)).toBe(1)
  })

  it('counts on below the bottom line and above the top line', () => {
    expect(stepAt(80, STAFF)).toBe(-2)
    expect(stepAt(75, STAFF)).toBe(-1)
    expect(stepAt(20, STAFF)).toBe(10)
    expect(stepAt(0, STAFF)).toBe(14)
  })

  // The layout gives the lines as fractions of the drawing's height.
  it('reads fractions of the height as well as pixels', () => {
    expect(stepAt(0.6, { topLine: 0.3, bottomLine: 0.7 })).toBe(2)
    expect(stepAt(0.7, { topLine: 0.3, bottomLine: 0.7 })).toBe(0)
  })
})
