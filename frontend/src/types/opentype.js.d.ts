declare module 'opentype.js' {
  export type PathCommand =
    | { type: 'M' | 'L'; x: number; y: number }
    | { type: 'Q'; x: number; y: number; x1: number; y1: number }
    | { type: 'C'; x: number; y: number; x1: number; y1: number; x2: number; y2: number }
    | { type: 'Z' }

  export class Font {
    getPath(text: string, x: number, y: number, fontSize: number): { commands: PathCommand[] }
    charToGlyph(character: string): { index: number }
  }

  export function parse(buffer: ArrayBuffer): Font
}
