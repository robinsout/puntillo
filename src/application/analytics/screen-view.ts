import type { ScreenView } from '@/application/ports'
import { isWikiTopic } from '@/domain/wiki'

const SCREENS: Readonly<Record<string, 'trainer' | 'progress' | 'settings' | 'wiki'>> = {
  '/': 'trainer',
  '/progress': 'progress',
  '/settings': 'settings',
  '/wiki': 'wiki',
}

const ARTICLE_PATH = /^\/wiki\/([^/]+)$/

// Only a fixed id of the screen leaves the page, never the address itself.
export function screenViewOf(path: string): ScreenView | null {
  const normalized = path.length > 1 ? path.replace(/\/$/, '') : path
  const page = SCREENS[normalized]
  if (page) return { page }
  const topic = ARTICLE_PATH.exec(normalized)?.[1]
  if (topic === undefined) return null
  return { page: 'wiki-article', topic: isWikiTopic(topic) ? topic : 'unknown' }
}
