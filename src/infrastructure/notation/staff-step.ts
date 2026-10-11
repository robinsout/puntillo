// Heights grow downwards, as on the screen; a step is half a staff space, counted from the bottom
// line up. The lines may be given in pixels or as fractions of the drawing's height.
export function stepAt(
  y: number,
  { topLine, bottomLine }: { readonly topLine: number; readonly bottomLine: number },
): number {
  const halfSpace = (bottomLine - topLine) / 8
  return Math.round((bottomLine - y) / halfSpace)
}
