import { describe, expect, it } from 'vitest'
import type { NoteNamingChoice } from '@/application/ports'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { parseStaffExample, type ArticleBlock } from '@/domain/wiki'
// Not through the index: main.ts imports the index, and the parser with Markdown must stay out of
// the initial bundle (spec §18).
import { parseArticle } from '@/infrastructure/wiki/parse-article'

// Feature wiki, slice 1: an article is a Markdown file with YAML front matter. The front matter
// holds the difficulty of Practice this, in the fields of serializeDifficulty, and the related
// topics; the body is Markdown with notes marked as :note[F#4] and examples in staff blocks:
// a fence of the language staff, its label after the language, the example in the text of
// parseStaffExample.

const LATIN: NoteNamingChoice = { noteNaming: 'latin-syllable', seventhNote: 'B' }

const PRACTICE: Difficulty = {
  ...presetDifficulty('first-steps'),
  durations: ['half', 'quarter', 'eighth'],
  askDuration: true,
  rests: true,
}

const FRONT_MATTER = `---
practice:
  low: C4
  high: C5
  ledgerLines: 0
  durations: [half, quarter, eighth]
  askDuration: true
  questionLength: one-note
  timeSignatures: [4/4]
  rests: true
related: []
---
`

const article = (body: string, frontMatter = FRONT_MATTER) => `${frontMatter}\n${body}`

const textOf = (html: string) => {
  const element = document.createElement('div')
  element.innerHTML = html
  return element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function textBlock(block: ArticleBlock | undefined) {
  if (block?.kind !== 'text') throw new Error(`expected a text block, got ${block?.kind}`)
  return block
}

function staffBlock(block: ArticleBlock | undefined) {
  if (block?.kind !== 'staff') throw new Error(`expected a staff block, got ${block?.kind}`)
  return block
}

describe('the front matter of an article', () => {
  it('gives the difficulty to practice', () => {
    expect(parseArticle(article('Text.'), LATIN).practice).toEqual(PRACTICE)
  })

  it('takes the fields of a difficulty left out as parseDifficulty does', () => {
    const { practice } = parseArticle(article('Text.'), LATIN)

    expect(practice.keySignatures).toBe(0)
    expect(practice.accidentals).toBe('none')
    expect(practice.dots).toBe(false)
  })

  it('gives no related topics when there are none', () => {
    expect(parseArticle(article('Text.'), LATIN).related).toEqual([])
  })

  it('gives the related topics in their order', () => {
    const frontMatter = FRONT_MATTER.replace('related: []', 'related: [durations]')

    expect(parseArticle(article('Text.', frontMatter), LATIN).related).toEqual(['durations'])
  })

  it.each([
    ['there is no front matter', 'Text.'],
    ['a related topic is unknown', article('Text.', FRONT_MATTER.replace('[]', '[xyz]'))],
    [
      'the difficulty is missing',
      article('Text.', FRONT_MATTER.replace(/practice:[\s\S]*?related/, 'related')),
    ],
    ['the difficulty is wrong', article('Text.', FRONT_MATTER.replace('low: C4', 'low: H9'))],
    [
      'the difficulty cannot be played',
      article('Text.', FRONT_MATTER.replace('high: C5', 'high: C4')),
    ],
    ['the front matter is no YAML', article('Text.', '---\npractice: [\n---\n')],
  ])('fails when %s', (_, source) => {
    expect(() => parseArticle(source, LATIN)).toThrow(Error)
  })
})

describe('the body of an article', () => {
  it('is Markdown made into HTML', () => {
    const [block, ...others] = parseArticle(
      article('Some **strong** text.\n\n- one\n- two'),
      LATIN,
    ).blocks

    expect(others).toEqual([])
    expect(textBlock(block).html).toContain('<strong>strong</strong>')
    expect(textBlock(block).html).toContain('<li>one</li>')
  })

  it('escapes HTML written in the Markdown', () => {
    const { html } = textBlock(
      parseArticle(article('A <b>bold</b> <script>x()</script>'), LATIN).blocks[0],
    )

    expect(html).not.toContain('<b>')
    expect(html).not.toContain('<script>')
    expect(textOf(html)).toContain('<b>bold</b>')
  })

  it('makes a staff block an example with its label', () => {
    const [block] = parseArticle(
      article('```staff A half note and a half rest\n4/4 C5/half rest/half\n```'),
      LATIN,
    ).blocks

    expect(staffBlock(block)).toEqual({
      kind: 'staff',
      label: 'A half note and a half rest',
      question: parseStaffExample('4/4 C5/half rest/half'),
    })
  })

  it('keeps the text and the examples in their order', () => {
    const { blocks } = parseArticle(
      article(
        [
          'Before.',
          '```staff First\n4/4 C4/whole\n```',
          'Between.',
          '```staff Second\n3/4 D4/half.\n```',
          'After.',
        ].join('\n\n'),
      ),
      LATIN,
    )

    expect(blocks.map((block) => block.kind)).toEqual(['text', 'staff', 'text', 'staff', 'text'])
    expect(textOf(textBlock(blocks[0]).html)).toBe('Before.')
    expect(staffBlock(blocks[1]).label).toBe('First')
    expect(textOf(textBlock(blocks[2]).html)).toBe('Between.')
    expect(staffBlock(blocks[3]).label).toBe('Second')
    expect(textOf(textBlock(blocks[4]).html)).toBe('After.')
  })

  it.each([
    ['has no label', '```staff\n4/4 C4/whole\n```'],
    ['is no example', '```staff Broken\n4/4 C4\n```'],
  ])('fails when a staff block %s', (_, body) => {
    expect(() => parseArticle(article(body), LATIN)).toThrow(Error)
  })
})

// Feature wiki, criterion 5 and its assumption: notes in the text are said in the naming of the
// user, with the sign as a symbol: «fa♯», «фа♯», «F♯».
describe('a note in the text of an article', () => {
  const said = (body: string, naming: NoteNamingChoice) =>
    textOf(textBlock(parseArticle(article(body), naming).blocks[0]).html)

  it.each([
    ['latin-syllable', 'The note fa♯ and si♭ and do.'],
    ['cyrillic-syllable', 'The note фа♯ and си♭ and до.'],
    ['letter', 'The note F♯ and B♭ and C.'],
  ] as const)('is named in the %s naming', (noteNaming, text) => {
    expect(
      said('The note :note[F#4] and :note[Bb4] and :note[C5].', { noteNaming, seventhNote: 'B' }),
    ).toBe(text)
  })

  it('follows the choice of H for the seventh note', () => {
    expect(said(':note[B4] and :note[Bb4]', { noteNaming: 'letter', seventhNote: 'H' })).toBe(
      'H and B',
    )
  })

  it('is named inside other Markdown', () => {
    expect(said('- **:note[E4]** is on the first line', LATIN)).toBe('mi is on the first line')
  })

  it('fails when the note is wrong', () => {
    expect(() => parseArticle(article('The note :note[H4].'), LATIN)).toThrow(Error)
  })
})

// Feature wiki, slice 2: the search reads a text block as the reader sees it: no tags, the
// entities as their characters, the notes named.
describe('the plain text of a text block', () => {
  const plainText = (body: string, naming = LATIN) =>
    textBlock(parseArticle(article(body), naming).blocks[0]).text

  it('has the words without the tags', () => {
    const text = plainText('Some **strong** text and a [link](https://example.org).')

    expect(text).toContain('Some strong text and a link.')
    expect(text).not.toContain('<')
    expect(text).not.toContain('example.org')
  })

  it('keeps the words of separate paragraphs and items apart', () => {
    const text = plainText('# Title\n\nFirst.\n\n- one\n- two')

    expect(text).toMatch(/Title\s+First\.\s+one\s+two/)
  })

  it('has the characters in place of their entities', () => {
    expect(plainText('Salt & pepper, 1 < 2, "quoted"')).toContain('Salt & pepper, 1 < 2, "quoted"')
  })

  it('has the text written as HTML as it shows', () => {
    expect(plainText('A <b>bold</b> word')).toContain('A <b>bold</b> word')
  })

  it.each([
    [{ noteNaming: 'latin-syllable', seventhNote: 'B' }, 'The note fa♯ and si♭.'],
    [{ noteNaming: 'cyrillic-syllable', seventhNote: 'B' }, 'The note фа♯ and си♭.'],
    [{ noteNaming: 'letter', seventhNote: 'H' }, 'The note F♯ and B.'],
  ] as const)('names the notes as the HTML does, in %o', (naming, text) => {
    expect(plainText('The note :note[F#4] and :note[Bb4].', naming)).toContain(text)
  })

  it('is the text of each text block, not of the examples', () => {
    const blocks = parseArticle(
      article(['Before.', '```staff A label\n4/4 C4/whole\n```', 'After.'].join('\n\n')),
      LATIN,
    ).blocks

    expect(textBlock(blocks[0]).text.trim()).toBe('Before.')
    expect(textBlock(blocks[2]).text.trim()).toBe('After.')
  })
})
