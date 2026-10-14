// WCAG 2.x relative luminance: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
const WEIGHTS = [0.2126, 0.7152, 0.0722]

function linear(channel: string): number {
  const value = parseInt(channel, 16) / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(color: string): number {
  return WEIGHTS.reduce(
    (sum, weight, index) => sum + weight * linear(color.slice(1 + 2 * index, 3 + 2 * index)),
    0,
  )
}

export function contrastRatio(foreground: string, background: string): number {
  const [a, b] = [luminance(foreground), luminance(background)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
