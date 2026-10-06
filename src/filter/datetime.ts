const daysIn = (year: number, month: number) => {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export const isValidDate = (text: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month)
}

export const isValidTimestamp = (text: string) => {
  const match =
    /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(text)
  if (!match) return false
  const [hour, minute, second] = [Number(match[2]), Number(match[3]), Number(match[4])]
  const [offsetHour, offsetMinute] = [Number(match[5] ?? 0), Number(match[6] ?? 0)]
  return (
    isValidDate(match[1]!) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  )
}

export const unitSeconds = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 } as const

/** Milliseconds since the epoch, or undefined when the text is not a valid RFC-3339 timestamp. */
export const timestampMillis = (text: string) =>
  isValidTimestamp(text) ? Date.parse(text.toUpperCase()) : undefined

const durationText = /^(\d+(?:\.\d+)?)(s|m|h|d|w)$/

/** Seconds for texts like `30s` or `1.5h` (units beyond `s` are an extension). */
export const durationSeconds = (text: string) => {
  const match = durationText.exec(text)
  return match ? Number(match[1]) * unitSeconds[match[2] as keyof typeof unitSeconds] : undefined
}
