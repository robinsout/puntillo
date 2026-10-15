// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PRESETS, type Preset } from '@/domain/difficulty'
import { presetExampleSource } from '@/presentation/preferences/preset-example-source'
import { PRESET_EXAMPLES } from '@/presentation/preferences/preset-examples'

// Feature fast-start, criteria 1 and 5: the cards of the presets show drawings made beforehand
// from what StaffView draws for their examples. Each file keeps, in data-source, the sha256 of
// what it was drawn from: the example, its scale, the version of VexFlow and the source of
// StaffView. A change of any of them without a new drawing fails here. The glyphs of Bravura are
// outlines, so the drawing needs no font.

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')

const renderer = () => ({
  vexflowVersion: (JSON.parse(read('node_modules/vexflow/package.json')) as { version: string })
    .version,
  staffView: read('src/infrastructure/notation/StaffView.vue'),
})

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const drawingOf = (preset: Preset) =>
  read(`src/presentation/preferences/preset-examples/${preset}.svg`)
const dataSourceOf = (svg: string) => /<svg\b[^>]*\sdata-source="([^"]*)"/.exec(svg)?.[1]

describe('the source of the drawing of an example', () => {
  it('is another one for each preset', () => {
    const sources = PRESETS.map((preset) => presetExampleSource(preset, renderer()))

    expect(new Set(sources).size).toBe(PRESETS.length)
  })

  it.each(PRESETS)('holds the example of %s', (preset) => {
    expect(presetExampleSource(preset, renderer())).toContain(
      JSON.stringify(PRESET_EXAMPLES[preset]),
    )
  })

  it('changes with the version of VexFlow', () => {
    const before = presetExampleSource('advanced', renderer())

    const after = presetExampleSource('advanced', { ...renderer(), vexflowVersion: '0.0.0' })

    expect(after).not.toBe(before)
  })

  it('changes with the source of StaffView', () => {
    const before = presetExampleSource('advanced', renderer())

    const after = presetExampleSource('advanced', {
      ...renderer(),
      staffView: `${renderer().staffView}\n`,
    })

    expect(after).not.toBe(before)
  })
})

describe.each(PRESETS)('the drawing of the example of %s', (preset) => {
  it('is up to date with its example and the renderer', () => {
    const expected = sha256(presetExampleSource(preset, renderer()))

    expect(
      dataSourceOf(drawingOf(preset)),
      'Preset examples are out of date: run npm run render:examples',
    ).toBe(expected)
  })

  it('draws the glyphs as outlines, with no font', () => {
    const svg = drawingOf(preset)

    expect(svg).toMatch(/<path\b/)
    expect(svg).not.toMatch(/<text\b/)
    expect(svg).not.toMatch(/font-family/)
    expect(svg).not.toMatch(/<style\b/)
    expect(svg).not.toMatch(/url\(/)
  })

  it('is drawn in the colour of the text around it', () => {
    const svg = drawingOf(preset)
    const paints = [...svg.matchAll(/(?:fill|stroke)\s*[=:]\s*"?([^";\s>]+)/g)].map(
      ([, paint]) => paint,
    )

    expect(svg).toMatch(/currentColor/)
    expect(paints.filter((paint) => paint !== 'currentColor' && paint !== 'none')).toEqual([])
  })
})
