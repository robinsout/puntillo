// Draws the examples on the cards of the presets beforehand, so that the start screen needs no
// VexFlow (feature fast-start). The staves are drawn by StaffView itself, in the section Preset
// examples of the catalog of the dev server; their glyphs of Bravura become outlines, so the
// drawings need no font. Run with npm run render:examples after a change of the examples, of
// StaffView or of VexFlow: a test tells when the drawings are out of date.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { create, type Font } from 'fontkit'
import { createServer } from 'vite'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

const EXAMPLES = new URL('src/presentation/preferences/preset-examples/', root)

// The modules of the app are loaded through the dev server, which knows their aliases.
interface AppModules {
  readonly PRESETS: readonly string[]
  readonly presetExampleSource: (
    preset: string,
    renderer: { vexflowVersion: string; staffView: string },
  ) => string
}

interface Glyphs {
  readonly text: string
  readonly fontFamily: string
  readonly fontSize: number
  readonly x: number
  readonly y: number
}

// VexFlow embeds its fonts as data URLs.
function bravura(): Font {
  const module = read('node_modules/vexflow/build/esm/src/fonts/bravura.js')
  const base64 = /base64,([A-Za-z0-9+/=]+)/.exec(module)?.[1]
  if (!base64) throw new Error('No Bravura in the VexFlow package')
  const font = create(Buffer.from(base64, 'base64'))
  if (!('layout' in font)) throw new Error('Bravura is a collection of fonts')
  return font
}

// Font units grow upwards; the drawing's grow downwards.
function outline(font: Font, { text, fontSize, x, y }: Glyphs): string {
  const scale = fontSize / font.unitsPerEm
  const { glyphs, positions } = font.layout(text)
  let advance = 0
  const paths = glyphs.map((glyph, index) => {
    const position = positions[index]
    const path = glyph.path
      .scale(scale, -scale)
      .translate(
        x + advance + (position?.xOffset ?? 0) * scale,
        y - (position?.yOffset ?? 0) * scale,
      )
    advance += (position?.xAdvance ?? 0) * scale
    return path.toSVG()
  })
  return paths.join('')
}

async function main() {
  const font = bravura()
  const server = await createServer({ root: fileURLToPath(root), logLevel: 'warn' })
  const browser = await chromium.launch()
  try {
    await server.listen()
    const url = server.resolvedUrls?.local[0]
    if (!url) throw new Error('The dev server has no local URL')
    const { PRESETS } = (await server.ssrLoadModule('/src/domain/difficulty')) as AppModules
    const { presetExampleSource } = (await server.ssrLoadModule(
      '/src/presentation/preferences/preset-example-source.ts',
    )) as AppModules
    const renderer = {
      vexflowVersion: (JSON.parse(read('node_modules/vexflow/package.json')) as { version: string })
        .version,
      staffView: read('src/infrastructure/notation/StaffView.vue'),
    }

    // The app imports the drawings: a missing one would break the page they are drawn on.
    mkdirSync(EXAMPLES, { recursive: true })
    for (const preset of PRESETS) {
      const file = new URL(`${preset}.svg`, EXAMPLES)
      if (!existsSync(file)) writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg"/>\n')
    }
    const page = await browser.newPage()
    await page.goto(new URL('design-system', url).href)
    for (const preset of PRESETS) {
      await page.locator(`[data-preset="${preset}"] svg .vf-stavenote`).waitFor()
    }
    // A staff redraws once its width is measured, in the next frame.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 100))),
    )

    for (const preset of PRESETS) {
      const staff = page.locator(`[data-preset="${preset}"] svg`)
      const texts = await staff.evaluate((svg) =>
        [...svg.querySelectorAll('text')].map((text) => {
          const style = getComputedStyle(text)
          return {
            text: text.textContent ?? '',
            fontFamily: style.fontFamily,
            fontSize: parseFloat(style.fontSize),
            x: Number(text.getAttribute('x') ?? 0),
            y: Number(text.getAttribute('y') ?? 0),
          }
        }),
      )
      for (const glyphs of texts) {
        if (!/^"?Bravura/.test(glyphs.fontFamily))
          throw new Error(`A text not in Bravura in ${preset}: ${glyphs.fontFamily}`)
      }
      const outlines = texts.map((glyphs) => outline(font, glyphs))
      const markup = await staff.evaluate((svg, outlines) => {
        const drawing = svg.cloneNode(true) as SVGSVGElement
        drawing.querySelectorAll('text').forEach((text, index) => {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', outlines[index] ?? '')
          const transform = text.getAttribute('transform')
          if (transform) path.setAttribute('transform', transform)
          path.setAttribute('fill', 'currentColor')
          text.replaceWith(path)
        })
        for (const element of drawing.querySelectorAll<SVGElement>('*')) {
          for (const paint of ['fill', 'stroke'] as const) {
            const value = element.style[paint] || element.getAttribute(paint)
            if (value) element.setAttribute(paint, value === 'none' ? 'none' : 'currentColor')
          }
          element.removeAttribute('style')
          element.removeAttribute('class')
          element.removeAttribute('id')
        }
        // The root keeps only its box; VexFlow's defaults for text and shadows are of no use.
        for (const name of drawing.getAttributeNames())
          if (name !== 'viewBox') drawing.removeAttribute(name)
        // Unpainted shapes are filled black by default, not in the colour of the text.
        drawing.setAttribute('fill', 'currentColor')
        drawing.setAttribute('stroke', 'currentColor')
        return new XMLSerializer().serializeToString(drawing)
      }, outlines)

      const dataSource = createHash('sha256')
        .update(presetExampleSource(preset, renderer))
        .digest('hex')
      const svg = markup.replace(/^<svg\b/, `<svg data-source="${dataSource}"`)
      writeFileSync(new URL(`${preset}.svg`, EXAMPLES), `${svg}\n`)
      console.log(`${preset}.svg`)
    }
  } finally {
    await browser.close()
    await server.close()
  }
}

await main()
