declare module 'tz-lookup' {
  /** Resolve geographic coordinates to an IANA time-zone identifier. */
  export default function tzlookup(latitude: number, longitude: number): string
}
