import MarkdownIt, { type Token } from 'markdown-it'
import { parse as parseYaml } from 'yaml'
import type { NoteNamingChoice } from '@/application/ports'
import { parseDifficulty, type Difficulty } from '@/domain/difficulty'
import { noteName } from '@/domain/naming'
import {
  isWikiTopic,
  parsePitchText,
  parseStaffExample,
  type ArticleBlock,
  type WikiArticle,
  type WikiHint,
  type WikiTopic,
} from '@/domain/wiki'

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/
const NOTE_MARK = /:note\[([^\]]*)\]/g
const STAFF_FENCE = /^staff(?:\s+(.*))?$/

// Raw HTML stays text: an article only has Markdown.
const markdown = new MarkdownIt({ html: false })

function parsePractice(data: unknown): Difficulty {
  const practice = data === undefined ? null : parseDifficulty(JSON.stringify(data))
  if (!practice) throw new Error(`The difficulty to practice is wrong: ${JSON.stringify(data)}`)
  return practice
}

function parseRelated(data: unknown): WikiTopic[] {
  if (!Array.isArray(data)) throw new Error('The related topics are not a list')
  return data.map((topic) => {
    if (typeof topic !== 'string' || !isWikiTopic(topic))
      throw new Error(`Unknown related topic: ${String(topic)}`)
    return topic
  })
}

const nameNotes = (text: string, naming: NoteNamingChoice) =>
  text.replace(NOTE_MARK, (_, text: string) => {
    const pitch = parsePitchText(text)
    if (!pitch) throw new Error(`Unknown note: ${text}`)
    return noteName(pitch.letter, naming.noteNaming, naming.seventhNote, pitch.alteration)
  })

const isMap = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null && !Array.isArray(data)

const nonEmptyText = (data: unknown): data is string =>
  typeof data === 'string' && data.trim() !== ''

function parseHint(data: unknown, naming: NoteNamingChoice): WikiHint {
  if (!isMap(data)) throw new Error('The hint is not a map')
  const { text, example, label } = data
  if (!nonEmptyText(text)) throw new Error('The hint has no text')
  if (!nonEmptyText(label)) throw new Error('The hint has no label')
  const question = typeof example === 'string' ? parseStaffExample(example) : null
  if (!question) throw new Error(`The example of the hint is wrong: ${String(example)}`)
  return { html: nameNotes(markdown.renderInline(text), naming), label, question }
}

function splitFrontMatter(source: string, naming: NoteNamingChoice) {
  const match = FRONT_MATTER.exec(source)
  if (!match) throw new Error('The article has no front matter')
  const data: unknown = parseYaml(match[1] ?? '')
  if (!isMap(data)) throw new Error('The front matter is not a map')
  const { practice, related, hint } = data
  return {
    practice: parsePractice(practice),
    related: parseRelated(related),
    hint: parseHint(hint, naming),
    body: source.slice(match[0].length),
  }
}

// The text as the reader sees it, for the search: entities decoded, raw HTML as written.
function plainText(tokens: readonly Token[]): string {
  return tokens
    .map((token) => {
      if (token.children) return plainText(token.children)
      if (['text', 'code_inline', 'code_block', 'fence'].includes(token.type)) return token.content
      // Blocks and line breaks part words, as they do on the screen.
      return (token.block && token.nesting === -1) || token.type.endsWith('break') ? '\n' : ''
    })
    .join('')
}

// A fence of the language staff: its label follows the language, its example is the content.
const staffFence = (token: Token) =>
  token.type === 'fence' ? STAFF_FENCE.exec(token.info.trim()) : null

function staffBlock(label: string, example: string): ArticleBlock {
  if (!label) throw new Error('A staff example has no label')
  const question = parseStaffExample(example)
  if (!question) throw new Error(`A staff example is wrong: ${example}`)
  return { kind: 'staff', label, question }
}

// Throws when the article is not in the format above; the library rejects with it.
export function parseArticle(source: string, naming: NoteNamingChoice): WikiArticle {
  const { practice, related, hint, body } = splitFrontMatter(source, naming)
  const blocks: ArticleBlock[] = []
  let text: Token[] = []
  const endText = () => {
    if (text.length === 0) return
    const html = markdown.renderer.render(text, markdown.options, {})
    blocks.push({
      kind: 'text',
      html: nameNotes(html, naming),
      text: nameNotes(plainText(text), naming),
    })
    text = []
  }
  for (const token of markdown.parse(body, {})) {
    const fence = staffFence(token)
    if (!fence) {
      text.push(token)
      continue
    }
    endText()
    blocks.push(staffBlock(fence[1]?.trim() ?? '', token.content))
  }
  endText()
  return { practice, related, blocks, hint }
}
