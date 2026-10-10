import { describe, expect, it } from 'vitest'
import { matchesQuery } from '@/domain/wiki'

// Feature wiki, criterion 3: a search finds a topic by its title and by the text of its article,
// whatever the case. Letters with marks are found when typed without them and the other way
// round, as people often leave out ё, é or ñ when they type.

describe('a search query', () => {
  it('is found inside the text', () => {
    expect(matchesQuery('Durations of notes and rests', 'notes')).toBe(true)
    expect(matchesQuery('Durations of notes and rests', 'of notes and')).toBe(true)
  })

  it('is not found when the text does not have it', () => {
    expect(matchesQuery('Durations of notes and rests', 'sharp')).toBe(false)
  })

  it('ignores the case', () => {
    expect(matchesQuery('Key signatures', 'KEY SIG')).toBe(true)
    expect(matchesQuery('KEY SIGNATURES', 'key sig')).toBe(true)
    expect(matchesQuery('Знаки при ключе', 'ЗНАКИ')).toBe(true)
  })

  it('ignores the marks over the letters, in the text and in the query', () => {
    expect(matchesQuery('Sostenido, bemol y becuadro', 'sóstenido')).toBe(true)
    expect(matchesQuery('Notas en el pentagrama', 'pentágrama')).toBe(true)
    expect(matchesQuery('Tonalidades y cómo reconocerlas', 'como')).toBe(true)
    expect(matchesQuery('en espanol', 'ESPAÑOL')).toBe(true)
    expect(matchesQuery('español', 'espanol')).toBe(true)
    expect(matchesQuery('Ещё одна нота', 'еще')).toBe(true)
    expect(matchesQuery('Еще одна нота', 'ещё')).toBe(true)
  })

  it('finds a note named with its sign', () => {
    expect(matchesQuery('The note fa♯ on the top line', 'FA♯')).toBe(true)
    expect(matchesQuery('The note fa♯ on the top line', 'fa♭')).toBe(false)
  })

  it('leaves out the spaces around it', () => {
    expect(matchesQuery('Key signatures', '  key  ')).toBe(true)
    expect(matchesQuery('Key signatures', '\tsignatures\n')).toBe(true)
  })

  it.each(['', ' ', '  \t\n'])('matches every text when empty: "%s"', (query) => {
    expect(matchesQuery('Key signatures', query)).toBe(true)
    expect(matchesQuery('', query)).toBe(true)
  })

  it('finds nothing in an empty text', () => {
    expect(matchesQuery('', 'key')).toBe(false)
  })
})
