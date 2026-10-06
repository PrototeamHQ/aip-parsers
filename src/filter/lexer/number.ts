import { diagnostic } from '../../shared/diagnostic'
import { isValidTimestamp } from '../datetime'
import type { FilterError } from '../errors'
import type { Extensions } from '../options'

const timestampShape = /\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})/y
const dateShape = /\d{4}-\d{2}-\d{2}/y
const dateTail = /[TtZz0-9:.+-]*/y
const hexShape = /0[xX][0-9a-fA-F]+/y
const numberShape = /\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y

const match = (shape: RegExp, source: string, at: number) => {
  shape.lastIndex = at
  return shape.exec(source)?.[0]
}

export type NumericScan =
  | { kind: 'number' | 'duration' | 'timestamp'; end: number }
  | { kind: 'error'; end: number; error: FilterError }
  | undefined

/**
 * Scans a token that starts with a digit. Returns undefined when the digits are just the
 * start of ordinary text (for example `3rd` or `30d` without the durationUnits extension).
 */
export const scanNumeric = (
  source: string,
  start: number,
  isDelimiter: (char: string | undefined) => boolean,
  extensions: Extensions,
): NumericScan => {
  const timestamp = match(timestampShape, source, start)
  if (timestamp && isValidTimestamp(timestamp)) return { kind: 'timestamp', end: start + timestamp.length }
  if (timestamp || match(dateShape, source, start)) {
    const end = start + (match(dateTail, source, start) ?? '').length
    return {
      kind: 'error',
      end,
      error: diagnostic(
        'invalid-timestamp',
        `"${source.slice(start, end)}" is not a valid RFC-3339 timestamp`,
        'Use a full timestamp like 2012-04-21T11:30:00Z, or quote a plain date: "2012-04-21"',
        { start, end },
      ),
    }
  }
  const hex = match(hexShape, source, start)
  if (hex) return isDelimiter(source[start + hex.length]) ? { kind: 'number', end: start + hex.length } : undefined
  const number = match(numberShape, source, start)!
  const end = start + number.length
  const units = extensions.durationUnits ? 'smhdw' : 's'
  if (units.includes(source[end] ?? ' ') && isDelimiter(source[end + 1])) return { kind: 'duration', end: end + 1 }
  return isDelimiter(source[end]) ? { kind: 'number', end } : undefined
}
