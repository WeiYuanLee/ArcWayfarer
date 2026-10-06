export function updatePikminSpotElement(element: HTMLElement, selected: boolean): void {
  const size = selected ? 38 : 32
  // MapLibre owns `transform` on the marker element. Set only our visual
  // properties so its translate transform survives React data refreshes.
  element.style.width = `${size}px`
  element.style.height = `${size}px`
  element.style.borderRadius = '50%'
  element.style.display = 'grid'
  element.style.placeItems = 'center'
  element.style.background = '#fff'
  element.style.border = `${selected ? 3 : 2}px solid ${selected ? '#e64980' : '#5bb247'}`
  element.style.boxShadow = '0 2px 7px rgba(0,0,0,.35)'
  element.style.fontSize = `${selected ? 22 : 18}px`
  element.style.cursor = 'pointer'
  element.style.padding = '0'
}
