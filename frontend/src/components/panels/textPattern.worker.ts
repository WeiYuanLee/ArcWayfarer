/// <reference lib="webworker" />
import { parse, type Font } from 'opentype.js'
import {
  contoursToCoordinates,
  limitTextContours,
  orderTextContoursForTraversal,
  outerTextContours,
  simplifyCoordinatePath,
  textContours,
  unsupportedFontCharacters,
} from './textPattern'

type Request = {
  id: number
  fontUrl: string
  text: string
  center: { lat: number; lng: number }
  widthMeters: number
  rotation: number
  toleranceMeters: number
}

const fonts = new Map<string, Promise<Font>>()

function loadFont(url: string): Promise<Font> {
  let promise = fonts.get(url)
  if (!promise) {
    promise = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error('font-load-failed')
      return parse(await response.arrayBuffer())
    })
    fonts.set(url, promise)
  }
  return promise
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data
  try {
    const font = await loadFont(request.fontUrl)
    const unsupported = unsupportedFontCharacters(font, request.text)
    if (unsupported.length) {
      self.postMessage({ id: request.id, unsupported })
      return
    }
    const contours = limitTextContours(orderTextContoursForTraversal(
      contoursToCoordinates(outerTextContours(textContours(font, request.text)), request.center, request.widthMeters, request.rotation)
        .map((path) => {
          const simplified = simplifyCoordinatePath(path, request.toleranceMeters)
          return simplified.length > 1 ? [...simplified, simplified[0]] : simplified
        })
    ))
    self.postMessage({ id: request.id, contours })
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : 'generation-failed' })
  }
}
