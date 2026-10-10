// Letters with marks match those without: people often type "como" for "cómo" or "еще" for "ещё".
const normalized = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLocaleLowerCase()

export function matchesQuery(text: string, query: string): boolean {
  return normalized(text).includes(normalized(query.trim()))
}
