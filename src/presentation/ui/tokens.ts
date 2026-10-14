const COMMENT = /\/\*[\s\S]*?\*\//g
const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/g

export function readTokens(css: string): ReadonlyMap<string, string> {
  const tokens = new Map<string, string>()
  for (const [, name, value] of css.replace(COMMENT, '').matchAll(DECLARATION)) {
    if (name && value) tokens.set(name, value.trim())
  }
  return tokens
}
