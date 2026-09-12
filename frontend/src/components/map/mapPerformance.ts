export const ROUTE_ARROW_SPACING_METERS = 180
export const MAX_ROUTE_ARROWS = 32
// Updating DOM-backed map markers at 60 FPS forces a full map repaint on
// Chromium. 20 FPS is visually smooth for route direction arrows and keeps
// the animation from monopolizing the renderer during long-running tasks.
export const ROUTE_ARROW_FRAME_INTERVAL_MS = 50

/** Keep decorative direction markers bounded independently of route length. */
export function routeArrowCount(totalLengthMeters: number): number {
  if (!Number.isFinite(totalLengthMeters) || totalLengthMeters < 40) return 0
  return Math.min(MAX_ROUTE_ARROWS, Math.max(1, Math.floor(totalLengthMeters / ROUTE_ARROW_SPACING_METERS)))
}
