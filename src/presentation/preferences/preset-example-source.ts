import type { Preset } from '@/domain/difficulty'
import { PRESET_EXAMPLES } from './preset-examples'

// The example is a thumbnail: drawn this small, the clef, the signs and the note fit its width.
export const PRESET_EXAMPLE_SCALE = 0.4

export interface PresetExampleRenderer {
  readonly vexflowVersion: string
  readonly staffView: string
}

// What the drawing of an example in src/presentation/preferences/preset-examples is made from;
// its sha256 is the data-source of the drawing, so that a change of any part calls for a new one.
export function presetExampleSource(preset: Preset, renderer: PresetExampleRenderer): string {
  return JSON.stringify({
    example: PRESET_EXAMPLES[preset],
    scale: PRESET_EXAMPLE_SCALE,
    vexflow: renderer.vexflowVersion,
    staffView: renderer.staffView,
  })
}
