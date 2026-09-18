import type { LatLng } from './types'

const EARTH_RADIUS_M = 6_371_000
const IMPROVEMENT_EPSILON_M = 0.01
const MAX_LOCAL_SEARCH_PASSES = 25
const MAX_CHEAPEST_INSERTION_POINTS = 80
export const MAX_FULL_OPTIMIZATION_POINTS = 200
export const MAX_OPTIMIZABLE_POINTS = 500

export type RouteOptimizationOptions = {
  isClosedLoop: boolean
}

export type RouteOptimizationResult = {
  order: number[]
  originalDistance: number
  optimizedDistance: number
  savedDistance: number
  wasLimited: boolean
}

function haversineDistance(left: LatLng, right: LatLng): number {
  const leftLat = left.lat * Math.PI / 180
  const rightLat = right.lat * Math.PI / 180
  const deltaLat = rightLat - leftLat
  const deltaLng = (right.lng - left.lng) * Math.PI / 180
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) ** 2
  const clamped = Math.min(1, Math.max(0, haversine))
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped))
}

function directRouteDistance(points: LatLng[], isClosedLoop: boolean): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += haversineDistance(points[index - 1], points[index])
  }
  if (isClosedLoop && points.length > 1) total += haversineDistance(points[points.length - 1], points[0])
  return total
}

function buildDistanceMatrix(points: LatLng[]): Float64Array {
  const count = points.length
  const matrix = new Float64Array(count * count)
  const latRadians = points.map((point) => point.lat * Math.PI / 180)
  const lngRadians = points.map((point) => point.lng * Math.PI / 180)

  for (let left = 0; left < count; left += 1) {
    for (let right = left + 1; right < count; right += 1) {
      const deltaLat = latRadians[right] - latRadians[left]
      const deltaLng = lngRadians[right] - lngRadians[left]
      const haversine = Math.sin(deltaLat / 2) ** 2
        + Math.cos(latRadians[left]) * Math.cos(latRadians[right]) * Math.sin(deltaLng / 2) ** 2
      const clamped = Math.min(1, Math.max(0, haversine))
      const distance = 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped))
      matrix[left * count + right] = distance
      matrix[right * count + left] = distance
    }
  }

  return matrix
}

function distanceBetween(matrix: Float64Array, count: number, left: number, right: number): number {
  return matrix[left * count + right]
}

function routeDistance(order: number[], matrix: Float64Array, isClosedLoop: boolean): number {
  const count = order.length
  let total = 0
  for (let index = 1; index < order.length; index += 1) {
    total += distanceBetween(matrix, count, order[index - 1], order[index])
  }
  if (isClosedLoop && order.length > 1) {
    total += distanceBetween(matrix, count, order[order.length - 1], order[0])
  }
  return total
}

function nearestNeighbor(seedOrder: number[], matrix: Float64Array): number[] {
  const count = seedOrder.length
  const result = [seedOrder[0]]
  const remaining = new Set(seedOrder.slice(1))

  while (remaining.size > 0) {
    const current = result[result.length - 1]
    let nearest = -1
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const candidate of remaining) {
      const distance = distanceBetween(matrix, count, current, candidate)
      if (distance < nearestDistance - IMPROVEMENT_EPSILON_M
        || (Math.abs(distance - nearestDistance) <= IMPROVEMENT_EPSILON_M && candidate < nearest)) {
        nearest = candidate
        nearestDistance = distance
      }
    }
    result.push(nearest)
    remaining.delete(nearest)
  }

  return result
}

function cheapestInsertion(seedOrder: number[], matrix: Float64Array, isClosedLoop: boolean): number[] {
  const count = seedOrder.length
  if (count < 2) return [...seedOrder]

  const start = seedOrder[0]
  let nearest = seedOrder[1]
  for (const candidate of seedOrder.slice(2)) {
    const candidateDistance = distanceBetween(matrix, count, start, candidate)
    const nearestDistance = distanceBetween(matrix, count, start, nearest)
    if (candidateDistance < nearestDistance - IMPROVEMENT_EPSILON_M
      || (Math.abs(candidateDistance - nearestDistance) <= IMPROVEMENT_EPSILON_M && candidate < nearest)) {
      nearest = candidate
    }
  }

  const route = [start, nearest]
  const remaining = new Set(seedOrder.slice(1).filter((index) => index !== nearest))
  while (remaining.size > 0) {
    let bestPoint = -1
    let bestPosition = -1
    let bestIncrease = Number.POSITIVE_INFINITY

    for (const candidate of remaining) {
      for (let position = 1; position <= route.length; position += 1) {
        const previous = route[position - 1]
        const next = position < route.length ? route[position] : isClosedLoop ? route[0] : null
        const increase = next === null
          ? distanceBetween(matrix, count, previous, candidate)
          : distanceBetween(matrix, count, previous, candidate)
            + distanceBetween(matrix, count, candidate, next)
            - distanceBetween(matrix, count, previous, next)
        if (increase < bestIncrease - IMPROVEMENT_EPSILON_M
          || (Math.abs(increase - bestIncrease) <= IMPROVEMENT_EPSILON_M
            && (candidate < bestPoint || (candidate === bestPoint && position < bestPosition)))) {
          bestPoint = candidate
          bestPosition = position
          bestIncrease = increase
        }
      }
    }

    route.splice(bestPosition, 0, bestPoint)
    remaining.delete(bestPoint)
  }

  return route
}

function improveWithTwoOpt(order: number[], matrix: Float64Array, isClosedLoop: boolean): boolean {
  const count = order.length
  let bestStart = -1
  let bestEnd = -1
  let bestDelta = -IMPROVEMENT_EPSILON_M

  for (let start = 1; start < count - 1; start += 1) {
    for (let end = start + 1; end < count; end += 1) {
      const before = order[start - 1]
      const first = order[start]
      const last = order[end]
      let oldEdges = distanceBetween(matrix, count, before, first)
      let newEdges = distanceBetween(matrix, count, before, last)
      if (end + 1 < count || isClosedLoop) {
        const after = order[(end + 1) % count]
        oldEdges += distanceBetween(matrix, count, last, after)
        newEdges += distanceBetween(matrix, count, first, after)
      }
      const delta = newEdges - oldEdges
      if (delta < bestDelta) {
        bestDelta = delta
        bestStart = start
        bestEnd = end
      }
    }
  }

  if (bestStart < 0) return false
  const reversed = order.slice(bestStart, bestEnd + 1).reverse()
  order.splice(bestStart, reversed.length, ...reversed)
  return true
}

function improveWithOrOpt(order: number[], matrix: Float64Array, isClosedLoop: boolean): boolean {
  const count = order.length
  let bestDelta = -IMPROVEMENT_EPSILON_M
  let bestStart = -1
  let bestLength = 0
  let bestPosition = -1

  const edge = (left: number | null, right: number | null) =>
    left === null || right === null ? 0 : distanceBetween(matrix, count, left, right)

  for (const segmentLength of [1, 2]) {
    for (let start = 1; start + segmentLength <= order.length; start += 1) {
      const first = order[start]
      const last = order[start + segmentLength - 1]
      const before = order[start - 1]
      const afterIndex = start + segmentLength
      const after = afterIndex < count ? order[afterIndex] : isClosedLoop ? order[0] : null
      const removalDelta = edge(before, after) - edge(before, first) - edge(last, after)
      const remainder = [...order.slice(0, start), ...order.slice(start + segmentLength)]
      for (let position = 1; position <= remainder.length; position += 1) {
        if (position === start) continue
        const insertBefore = remainder[position - 1]
        const insertAfter = position < remainder.length
          ? remainder[position]
          : isClosedLoop ? remainder[0] : null
        const insertionDelta = edge(insertBefore, first) + edge(last, insertAfter) - edge(insertBefore, insertAfter)
        const delta = removalDelta + insertionDelta
        if (delta < bestDelta) {
          bestDelta = delta
          bestStart = start
          bestLength = segmentLength
          bestPosition = position
        }
      }
    }
  }

  if (bestStart < 0) return false
  const segment = order.splice(bestStart, bestLength)
  order.splice(bestPosition, 0, ...segment)
  return true
}

/** Optimizes geographic waypoint order while keeping points[0] as the start. */
export function optimizeRouteOrder(points: LatLng[], options: RouteOptimizationOptions): RouteOptimizationResult {
  const count = points.length
  const originalOrder = Array.from({ length: count }, (_, index) => index)
  if (count > MAX_OPTIMIZABLE_POINTS) {
    const originalDistance = directRouteDistance(points, options.isClosedLoop)
    return {
      order: originalOrder,
      originalDistance,
      optimizedDistance: originalDistance,
      savedDistance: 0,
      wasLimited: true,
    }
  }
  if (count < 3) {
    const matrix = buildDistanceMatrix(points)
    const originalDistance = routeDistance(originalOrder, matrix, options.isClosedLoop)
    return { order: originalOrder, originalDistance, optimizedDistance: originalDistance, savedDistance: 0, wasLimited: false }
  }

  const matrix = buildDistanceMatrix(points)
  const originalDistance = routeDistance(originalOrder, matrix, options.isClosedLoop)
  const candidates = [
    originalOrder,
    nearestNeighbor(originalOrder, matrix),
  ]
  if (count <= MAX_CHEAPEST_INSERTION_POINTS) {
    candidates.push(cheapestInsertion(originalOrder, matrix, options.isClosedLoop))
  }
  let optimized = [...candidates.reduce((best, candidate) =>
    routeDistance(candidate, matrix, options.isClosedLoop) < routeDistance(best, matrix, options.isClosedLoop)
      ? candidate
      : best,
  )]

  for (let pass = 0; pass < MAX_LOCAL_SEARCH_PASSES; pass += 1) {
    const twoOptImproved = improveWithTwoOpt(optimized, matrix, options.isClosedLoop)
    const orOptImproved = count <= MAX_FULL_OPTIMIZATION_POINTS
      ? improveWithOrOpt(optimized, matrix, options.isClosedLoop)
      : false
    if (!twoOptImproved && !orOptImproved) break
  }

  const optimizedDistance = routeDistance(optimized, matrix, options.isClosedLoop)
  return {
    order: optimized,
    originalDistance,
    optimizedDistance,
    savedDistance: Math.max(0, originalDistance - optimizedDistance),
    wasLimited: false,
  }
}
