export type Coordinate = { lat: number; lng: number }

export const MAX_DISPLAY_PATH_POINTS = 4_000
export const MAX_DISPLAY_LEG_POINTS = 1_500

/** Bound renderer geometry without changing the backend simulation path. */
export function limitDisplayPath<T extends Coordinate>(points: T[], maxPoints = MAX_DISPLAY_PATH_POINTS): T[] {
  if (points.length <= maxPoints || maxPoints < 2) return points
  const sampled: T[] = []
  let previousIndex = -1
  for (let index = 0; index < maxPoints; index++) {
    const sourceIndex = Math.round(index * (points.length - 1) / (maxPoints - 1))
    if (sourceIndex !== previousIndex) sampled.push(points[sourceIndex])
    previousIndex = sourceIndex
  }
  return sampled
}

export function limitDisplayLegs<T extends Coordinate>(legs: T[][]): T[][] {
  return legs.map((leg) => limitDisplayPath(leg, MAX_DISPLAY_LEG_POINTS))
}
