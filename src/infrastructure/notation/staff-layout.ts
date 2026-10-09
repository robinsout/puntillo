// Places as fractions of the drawing's width and height, so they hold at any size. Each note
// and rest names the line of the staff it stands on, and each line its band of the drawing's height
// and where its notes may start, right of the clef and the time signature.
export interface StaffLayout {
  readonly notes: readonly { readonly x: number; readonly y: number; readonly line: number }[]
  readonly rests: readonly { readonly x: number; readonly line: number }[]
  readonly lines: readonly {
    readonly left: number
    readonly top: number
    readonly bottom: number
  }[]
}
