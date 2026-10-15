// Renders public/favicon.svg into favicon.ico (16, 32, 48) and apple-touch-icon.png (180).
// Usage: node scripts/render-icons.mjs
import fs from 'node:fs'
import { chromium } from 'playwright'

const PUBLIC = new URL('../public/', import.meta.url)
const svg = fs.readFileSync(new URL('favicon.svg', PUBLIC), 'utf8')
const ICO_SIZES = [16, 32, 48]
// Apple rounds the corners itself and fills transparency with black: full bleed on the accent.
const APPLE_SIZE = 180
const APPLE_BACKGROUND = '#8c2f39'

const browser = await chromium.launch()

async function render(size, background) {
  const context = await browser.newContext({ viewport: { width: size, height: size } })
  const page = await context.newPage()
  const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `)
  await page.setContent(
    `<body style="margin:0;background:${background ?? 'transparent'}">${sized}</body>`,
  )
  const png = await page.screenshot({
    omitBackground: !background,
    clip: { x: 0, y: 0, width: size, height: size },
  })
  await context.close()
  return png
}

// An ICO of PNG entries: a 6-byte header, a 16-byte entry per image, then the images.
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length + 16 * images.length
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size, 0)
    entry.writeUInt8(size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)])
}

const images = []
for (const size of ICO_SIZES) images.push({ size, png: await render(size) })
fs.writeFileSync(new URL('favicon.ico', PUBLIC), ico(images))
fs.writeFileSync(
  new URL('apple-touch-icon.png', PUBLIC),
  await render(APPLE_SIZE, APPLE_BACKGROUND),
)

await browser.close()
