import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { StaffView } from '@/infrastructure/notation'
import type { StaffLayout } from '@/infrastructure/notation'
import type { KeySignature } from '@/domain/key-signature'
import type { Letter, Pitch } from '@/domain/pitch'
import {
  createQuestionOf,
  type Accidental,
  type Duration,
  type Note,
  type NoteOrRest,
  type TimeSignature,
} from '@/domain/question'

// Feature accidentals, slice 2, criterion 4: a sign written before a note, its own or a courtesy
// one, is drawn right before its head, at its height. A note that sounds altered by the key
// signature or by a sign earlier in the bar has no sign of its own and is drawn as a plain head.
//
// VexFlow draws the sign as a SMuFL glyph inside the group of the note it stands before. jsdom has
// no layout, so glyphs have no width: a sign's x is just left of its head's x. The room a sign
// takes on a narrow screen is measured in a real browser (e2e).

const SIGN: Record<Accidental, string> = { sharp: '\uE262', flat: '\uE260', natural: '\uE261' }
const DOT = '\uE1E7'
// The whole, half and black note heads.
const HEADS = ['\uE0A2', '\uE0A3', '\uE0A4']

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const ONE_SHARP: KeySignature = { count: 1, accidental: 'sharp' }

const note = (
  letter: Letter,
  octave: number,
  {
    alteration,
    accidental,
    duration = { value: 'quarter' },
  }: {
    alteration?: Pitch['alteration']
    accidental?: Accidental
    duration?: Duration
  } = {},
): Note => {
  const pitch: Pitch =
    alteration === undefined ? { letter, octave } : { letter, octave, alteration }
  return accidental ? { pitch, duration, accidental } : { pitch, duration }
}

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

const all = (root: Element, selector: string) => [...root.querySelectorAll(selector)]

interface Glyph {
  glyph: string
  x: number
  y: number
}

const glyphOf = (text: Element): Glyph => ({
  glyph: text.textContent ?? '',
  x: Number(text.getAttribute('x')),
  y: Number(text.getAttribute('y')),
})

const SIGNS = Object.values(SIGN)

async function drawn(elements: NoteOrRest[], keySignature: KeySignature = { count: 0 }) {
  const question = createQuestionOf(FOUR_FOUR, elements, keySignature)
  wrapper = mount(StaffView, { props: { question, label: 'Music staff' }, attachTo: document.body })
  const view = wrapper
  await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
  const [layout] = (view.emitted('drawn')?.at(-1) ?? []) as [StaffLayout?]
  // Each stave note in its order: its head and the signs drawn with it.
  const staveNotes = all(view.element, '.vf-stavenote').map((group) => {
    const glyphs = all(group, 'text').map(glyphOf)
    return {
      head: glyphs.find((each) => HEADS.includes(each.glyph)),
      signs: glyphs.filter((each) => SIGNS.includes(each.glyph)),
    }
  })
  return { root: view.element, layout, staveNotes }
}

const signsOf = (staveNotes: { signs: Glyph[] }[]) =>
  staveNotes.map(({ signs }) => signs.map(({ glyph }) => glyph).join(''))

describe('StaffView with signs before notes', () => {
  it.each(Object.entries(SIGN))('draws a %s before the note that has it', async (accidental) => {
    const { staveNotes } = await drawn([
      note('F', 4, { alteration: 1, accidental: accidental as Accidental }),
    ])

    expect(signsOf(staveNotes)).toEqual([SIGN[accidental as Accidental]])
  })

  it('draws each sign with its note alone, none with a note without one', async () => {
    const { staveNotes } = await drawn([
      note('F', 4, { alteration: 1, accidental: 'sharp' }),
      note('G', 4),
      note('F', 5, { accidental: 'natural' }),
      note('B', 4, { alteration: -1, accidental: 'flat' }),
    ])

    expect(signsOf(staveNotes)).toEqual([SIGN.sharp, '', SIGN.natural, SIGN.flat])
  })

  it('draws a note sounding altered without a sign of its own as a plain head', async () => {
    const { staveNotes } = await drawn([
      note('F', 4, { alteration: 1, accidental: 'sharp' }),
      note('F', 4, { alteration: 1 }),
    ])

    expect(signsOf(staveNotes)).toEqual([SIGN.sharp, ''])
  })

  it('draws no sign where the key signature alters the note', async () => {
    const { root, staveNotes } = await drawn([note('F', 5, { alteration: 1 })], ONE_SHARP)

    expect(signsOf(staveNotes)).toEqual([''])
    expect(all(root, '.vf-keysignature text')).toHaveLength(1)
  })

  it('draws the sign left of its head, at its height', async () => {
    const { staveNotes } = await drawn([
      note('F', 4, { alteration: 1, accidental: 'sharp' }),
      note('C', 5, { accidental: 'natural' }),
      note('E', 5, { alteration: -1, accidental: 'flat' }),
    ])

    for (const { head, signs } of staveNotes) {
      const [sign] = signs
      expect(sign?.x).toBeLessThan(head?.x ?? -Infinity)
      expect(sign?.y).toBe(head?.y)
    }
  })

  it('draws the sign of a dotted note as well as its dot', async () => {
    const { root, staveNotes } = await drawn([
      note('F', 4, { alteration: 1, accidental: 'sharp', duration: { value: 'half', dots: 1 } }),
      note('G', 4),
    ])

    expect(signsOf(staveNotes)).toEqual([SIGN.sharp, ''])
    expect(all(root, 'text').filter((text) => text.textContent === DOT)).toHaveLength(1)
  })

  it('reports every note and rest as before: a sign takes no place of its own', async () => {
    const { layout } = await drawn([
      note('F', 4, { alteration: 1, accidental: 'sharp' }),
      { duration: { value: 'quarter' } },
      note('F', 5, { accidental: 'natural' }),
      note('G', 4),
    ])

    expect(layout?.notes).toHaveLength(3)
    expect(layout?.rests).toHaveLength(1)
  })
})
