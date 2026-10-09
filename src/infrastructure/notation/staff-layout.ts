// Notehead centres as fractions of the drawing's width and height, so they hold at any size.
export interface StaffLayout {
  readonly notes: readonly { readonly x: number; readonly y: number }[]
}
