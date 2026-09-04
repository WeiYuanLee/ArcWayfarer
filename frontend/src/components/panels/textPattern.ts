import { parse, type Font } from 'opentype.js'
import ClipperLib from 'clipper-lib'
import { movePoint } from './coords'
import type { LatLng } from './types'

export type TextCapacityError = 'empty' | 'emoji' | 'chinese_limit' | 'english_limit'
export type TextCapacity = { chinese: number; englishLetters: number; valid: boolean; error?: TextCapacityError }
export type TextContour = Array<{ x: number; y: number }>

const CHINESE = /[\u3400-\u9fff\uf900-\ufaff]/gu
const ENGLISH_LETTER = /[A-Za-z]/g
const EMOJI = /\p{Extended_Pictographic}/u

/** The product limit is intentionally based on readable units, not UTF-16 length. */
export function validateTextPattern(text: string): TextCapacity {
  const chinese = (text.match(CHINESE) ?? []).length
  const englishLetters = (text.match(ENGLISH_LETTER) ?? []).length
  if (!text.trim()) return { chinese, englishLetters: 0, valid: false, error: 'empty' }
  if (EMOJI.test(text)) return { chinese, englishLetters, valid: false, error: 'emoji' }
  if (chinese > 5) return { chinese, englishLetters, valid: false, error: 'chinese_limit' }
  if (englishLetters > 12) return { chinese, englishLetters, valid: false, error: 'english_limit' }
  return { chinese, englishLetters, valid: true }
}

export function unsupportedFontCharacters(font: Font, text: string): string[] {
  const unsupported = new Set<string>()
  for (const character of text) {
    if (!character.trim()) continue
    if (font.charToGlyph(character).index === 0) unsupported.add(character)
  }
  return [...unsupported]
}

export type TextRouteFont = 'regular' | 'black'
export const TEXT_PATTERN_FONT_LOAD_ERROR = 'text-pattern-font-load-failed'
const fontPromises = new Map<TextRouteFont, Promise<Font>>()

export async function loadTextPatternFont(weight: TextRouteFont = 'regular'): Promise<Font> {
  if (!fontPromises.has(weight)) {
    const file = weight === 'black' ? 'NotoSansCJKtc-Black.otf' : 'NotoSansCJKtc-Regular.otf'
    fontPromises.set(weight, fetch(`/fonts/${file}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(TEXT_PATTERN_FONT_LOAD_ERROR)
        return parse(await response.arrayBuffer())
      }))
  }
  return fontPromises.get(weight)!
}

function sampleQuadratic(from: TextContour[number], control: TextContour[number], to: TextContour[number], output: TextContour) {
  for (let step = 1; step <= 8; step++) {
    const t = step / 8
    output.push({ x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t ** 2 * to.x, y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t ** 2 * to.y })
  }
}

function sampleCubic(from: TextContour[number], c1: TextContour[number], c2: TextContour[number], to: TextContour[number], output: TextContour) {
  for (let step = 1; step <= 12; step++) {
    const t = step / 12
    output.push({
      x: (1 - t) ** 3 * from.x + 3 * (1 - t) ** 2 * t * c1.x + 3 * (1 - t) * t ** 2 * c2.x + t ** 3 * to.x,
      y: (1 - t) ** 3 * from.y + 3 * (1 - t) ** 2 * t * c1.y + 3 * (1 - t) * t ** 2 * c2.y + t ** 3 * to.y,
    })
  }
}

/** Converts font outlines to separate sampled contours. Transit legs are added by the caller. */
export function textContours(font: Font, text: string, fontSize = 1000): TextContour[] {
  const path = font.getPath(text, 0, 0, fontSize)
  const contours: TextContour[] = []
  let contour: TextContour | null = null
  let current = { x: 0, y: 0 }
  let contourStart: { x: number; y: number } | null = null
  const closeContour = () => {
    if (contour && contourStart && (current.x !== contourStart.x || current.y !== contourStart.y)) contour.push(contourStart)
  }
  for (const command of path.commands) {
    if (command.type === 'M') {
      closeContour()
      contour = [{ x: command.x, y: command.y }]
      contours.push(contour)
      current = { x: command.x, y: command.y }
      contourStart = current
    } else if (contour && command.type === 'L') {
      current = { x: command.x, y: command.y }; contour.push(current)
    } else if (contour && command.type === 'Q') {
      const to = { x: command.x, y: command.y }; sampleQuadratic(current, { x: command.x1, y: command.y1 }, to, contour); current = to
    } else if (contour && command.type === 'C') {
      const to = { x: command.x, y: command.y }; sampleCubic(current, { x: command.x1, y: command.y1 }, { x: command.x2, y: command.y2 }, to, contour); current = to
    } else if (contour && command.type === 'Z' && contourStart) {
      // OpenType glyph contours are normally closed.  Omitting Z leaves every
      // character outline open and makes text unreadable on the map.
      closeContour()
      current = contourStart
    }
  }
  closeContour()
  return contours.filter((points) => points.length >= 2)
}

/** Keeps contour boundaries while bringing the complete route under its waypoint budget. */
export function limitTextContours<T>(contours: T[][], maxPoints = 240): T[][] {
  const total = contours.reduce((sum, contour) => sum + contour.length, 0)
  if (total <= maxPoints) return contours
  return contours.map((contour) => {
    const target = Math.min(contour.length, Math.max(2, Math.floor(contour.length / total * maxPoints)))
    if (target >= contour.length) return contour
    return Array.from({ length: target }, (_, index) => contour[Math.round(index * (contour.length - 1) / (target - 1))])
  })
}

/** Douglas–Peucker in an approximate local metre plane, after GPS projection. */
export function simplifyCoordinatePath(points: LatLng[], toleranceMeters = 5): LatLng[] {
  if (points.length <= 2) return points
  const scale = 111_320
  const project = (point: LatLng) => ({ x: point.lng * scale * Math.cos(point.lat * Math.PI / 180), y: point.lat * scale })
  const first = project(points[0]); const last = project(points[points.length - 1])
  let greatest = 0; let split = -1
  for (let index = 1; index < points.length - 1; index++) {
    const point = project(points[index]); const dx = last.x - first.x; const dy = last.y - first.y
    const distance = dx || dy ? Math.abs(dy * point.x - dx * point.y + last.x * first.y - last.y * first.x) / Math.hypot(dx, dy) : Math.hypot(point.x - first.x, point.y - first.y)
    if (distance > greatest) { greatest = distance; split = index }
  }
  if (greatest <= toleranceMeters) return [points[0], points[points.length - 1]]
  return [...simplifyCoordinatePath(points.slice(0, split + 1), toleranceMeters).slice(0, -1), ...simplifyCoordinatePath(points.slice(split), toleranceMeters)]
}

/** Make traversal start at the visually first (left-most) text component. */
export function orderTextContoursForTraversal(contours: LatLng[][]): LatLng[][] {
  const bounds = (contour: LatLng[]) => ({
    west: Math.min(...contour.map((point) => point.lng)),
    north: Math.max(...contour.map((point) => point.lat)),
  })
  const rotateToUpperLeft = (contour: LatLng[]) => {
    if (contour.length < 2) return contour
    const closed = contour[0].lat === contour.at(-1)?.lat && contour[0].lng === contour.at(-1)?.lng
    const ring = closed ? contour.slice(0, -1) : [...contour]
    if (!ring.length) return contour
    const start = ring.reduce((best, point, index) => {
      const current = ring[best]
      return point.lng < current.lng || (point.lng === current.lng && point.lat > current.lat) ? index : best
    }, 0)
    const rotated = [...ring.slice(start), ...ring.slice(0, start)]
    return closed ? [...rotated, rotated[0]] : rotated
  }
  return [...contours]
    .filter((contour) => contour.length >= 2)
    .sort((left, right) => {
      const a = bounds(left); const b = bounds(right)
      return a.west - b.west || b.north - a.north
    })
    .map(rotateToUpperLeft)
}

/**
 * Turns raw font contours into the walkable outer boundary.  Clipper operates
 * in font units, before any geographic projection, so holes and overlapping
 * strokes never create map-scale self-intersections.
 */
export function outerTextContours(contours: TextContour[], bufferUnits = 14): TextContour[] {
  const subject = contours
    .filter((contour) => contour.length >= 3)
    .map((contour) => contour.map((point) => ({ X: Math.round(point.x), Y: Math.round(point.y) })))
  if (!subject.length) return []
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true)
  const union: ClipperLib.Paths = []
  clipper.Execute(ClipperLib.ClipType.ctUnion, union, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  const offset = new ClipperLib.ClipperOffset(2, 0.25)
  offset.AddPaths(union, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const buffered: ClipperLib.Paths = []
  offset.Execute(buffered, bufferUnits)
  if (!buffered.length) return []
  // Buffering can make originally separate strokes overlap.  A second union is
  // essential: without it the map only *looks* thicker while still traversing
  // overlapping outlines at every crossing.
  const merged = new ClipperLib.Clipper()
  merged.AddPaths(buffered, ClipperLib.PolyType.ptSubject, true)
  const tree = new ClipperLib.PolyTree()
  merged.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)

  type Component = { outer: ClipperLib.Path; holes: ClipperLib.Path[] }
  const components: Component[] = []
  const collectComponents = (node: ClipperLib.PolyNode) => {
    for (const child of node.Childs()) {
      if (!child.IsHole()) {
        components.push({ outer: child.Contour(), holes: child.Childs().filter((nested) => nested.IsHole()).map((hole) => hole.Contour()) })
      }
      collectComponents(child)
    }
  }
  collectComponents(tree)

  const nearestPair = (left: ClipperLib.Path, right: ClipperLib.Path) => {
    let best = { left: 0, right: 0, distance: Infinity }
    left.forEach((a, leftIndex) => right.forEach((b, rightIndex) => {
      const distance = (a.X - b.X) ** 2 + (a.Y - b.Y) ** 2
      if (distance < best.distance) best = { left: leftIndex, right: rightIndex, distance }
    }))
    return best
  }
  const rotateClosed = (path: ClipperLib.Path, at: number) => [...path.slice(at), ...path.slice(0, at + 1)]
  const bridgeHole = (outer: ClipperLib.Path, hole: ClipperLib.Path) => {
    const { left, right } = nearestPair(outer, hole)
    const outerLoop = rotateClosed(outer, left)
    const holeLoop = rotateClosed(hole, right)
    // A → B → (hole) → B → A is the intentional slit that turns a polygon
    // with a hole into one continuous, navigable polyline.
    return [outerLoop[0], ...holeLoop, outerLoop[0], ...outerLoop.slice(1)]
  }
  const atomic = components
    .filter((component) => component.outer.length >= 3)
    .map((component) => ClipperLib.Clipper.CleanPolygon(component.holes.reduce(bridgeHole, component.outer), 8))
    .filter((path) => path.length >= 3)
  if (!atomic.length) return []

  // Keep atomic contours separate.  Text preview must never draw a direct
  // line from one character (or disconnected component) to the next.
  return atomic.map((path) => path.map((point) => ({ x: point.X, y: point.Y })))
}

export function contoursToCoordinates(contours: TextContour[], center: LatLng, widthMeters: number, rotationDeg = 0): LatLng[][] {
  const points = contours.flat()
  const minX = Math.min(...points.map((point) => point.x)); const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y)); const maxY = Math.max(...points.map((point) => point.y))
  const scale = widthMeters / Math.max(1, maxX - minX)
  const rotation = rotationDeg * Math.PI / 180
  return contours.map((contour) => contour.map((point) => {
    const east = (point.x - (minX + maxX) / 2) * scale
    const north = -((point.y - (minY + maxY) / 2) * scale)
    const rotatedEast = east * Math.cos(rotation) - north * Math.sin(rotation)
    const rotatedNorth = east * Math.sin(rotation) + north * Math.cos(rotation)
    return movePoint(center, Math.atan2(rotatedEast, rotatedNorth) * 180 / Math.PI, Math.hypot(rotatedEast, rotatedNorth))
  }))
}
