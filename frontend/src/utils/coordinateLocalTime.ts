import tzlookup from 'tz-lookup'

export type CoordinateLocalTime = {
  display: string
  timeZone: string
}

export function coordinateLocalTime(
  date: Date,
  latitude: number | null,
  longitude: number | null,
  locale: string,
): CoordinateLocalTime | null {
  if (
    latitude === null || longitude === null
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
  ) return null

  try {
    const timeZone = tzlookup(latitude, longitude)
    // Include the local calendar date because the selected coordinate may be
    // on the previous or next day relative to the computer running the app.
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '--'
    const display = `${value('month')}/${value('day')} ${value('hour')}:${value('minute')}`
    return { display, timeZone }
  } catch {
    return null
  }
}
