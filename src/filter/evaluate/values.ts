import { durationSeconds, timestampMillis, unitSeconds } from '../datetime'
import type { Operand } from '../ast'
import { Decimal, parseDecimal } from './decimal'

export type Duration = { seconds: number }

export const isDuration = (value: unknown): value is Duration =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && !(value instanceof Decimal) && 'seconds' in value && typeof value.seconds === 'number'

/** Evaluated value of a literal; numbers keep full precision when written as plain decimals. */
export const literalValue = (node: Exclude<Operand, { kind: 'member' | 'call' | 'binary' }>) => {
  switch (node.kind) {
    case 'string':
      return node.value
    case 'number':
      return parseDecimal(node.raw) ?? node.value
    case 'boolean':
      return node.value
    case 'duration':
      return { seconds: node.amount * unitSeconds[node.unit] } satisfies Duration
    case 'timestamp':
      return new Date(timestampMillis(node.value) ?? NaN)
  }
}

export const secondsOf = (value: unknown) => {
  if (isDuration(value)) return value.seconds
  if (typeof value === 'number') return value
  return typeof value === 'string' ? durationSeconds(value) : undefined
}

export const millisOf = (value: unknown) => {
  if (value instanceof Date) return value.getTime()
  return typeof value === 'string' ? timestampMillis(value) : undefined
}

/** Source-like text of a value, used for search terms and key lookups. */
export const textOf = (node: Operand) => {
  switch (node.kind) {
    case 'string':
      return node.value
    case 'member':
      return node.path.join('.')
    case 'number':
      return node.raw
    case 'boolean':
      return String(node.value)
    case 'duration':
      return `${node.amount}${node.unit}`
    case 'timestamp':
      return node.value
    default:
      return undefined
  }
}
