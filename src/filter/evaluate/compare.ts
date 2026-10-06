import type { CompareOp } from '../ast'
import { decimalOf, Decimal } from './decimal'
import { globMatch } from './glob'
import { isDuration, millisOf, secondsOf } from './values'

const verdict = (op: CompareOp, order: number) => {
  switch (op) {
    case '=':
      return order === 0
    case '!=':
      return order !== 0
    case '<':
      return order < 0
    case '<=':
      return order <= 0
    case '>':
      return order > 0
    case '>=':
      return order >= 0
  }
}

const order = (a: number | string, b: number | string) => (a < b ? -1 : a > b ? 1 : 0)

const numbers = (actual: unknown, expected: unknown) => {
  const a = decimalOf(actual)
  const b = decimalOf(expected)
  if (a && b) return a.compare(b)
  const x = typeof actual === 'number' ? actual : a?.toNumber()
  const y = typeof expected === 'number' ? expected : b?.toNumber()
  return x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y) ? undefined : order(x, y)
}

// A string expectation also matches numbers, timestamps, booleans and durations when the
// actual value is of that type and the text converts (AIP-160 type conversion).
const againstString = (op: CompareOp, actual: unknown, expected: string) => {
  const wildcard = (op === '=' || op === '!=') && expected.includes('*')
  if (typeof actual === 'string') {
    return wildcard ? verdict(op, globMatch(expected, actual) ? 0 : 1) : verdict(op, order(actual, expected))
  }
  if (typeof actual === 'number' || typeof actual === 'bigint') {
    const result = numbers(actual, expected)
    return result === undefined ? undefined : verdict(op, result)
  }
  if (actual instanceof Date) {
    const millis = millisOf(expected)
    return millis === undefined ? undefined : verdict(op, order(actual.getTime(), millis))
  }
  if (typeof actual === 'boolean') {
    return expected === 'true' || expected === 'false' ? verdict(op, order(String(actual), expected)) : undefined
  }
  if (isDuration(actual)) {
    const seconds = secondsOf(expected)
    return seconds === undefined ? undefined : verdict(op, order(actual.seconds, seconds))
  }
  return undefined
}

/**
 * Compares one actual value with the evaluated right-hand value. Incomparable pairs are
 * false for every operator, including `!=`; the caller turns `!=` into NOT(`=`).
 */
export const compareValue = (op: CompareOp, actual: unknown, expected: unknown): boolean => {
  if (actual === null || actual === undefined) return false
  if (typeof expected === 'string') return againstString(op, actual, expected) ?? false
  if (expected instanceof Decimal || typeof expected === 'number' || typeof expected === 'bigint') {
    const result = numbers(actual, expected)
    return result === undefined ? false : verdict(op, result)
  }
  if (typeof expected === 'boolean') {
    const value = typeof actual === 'string' ? (actual === 'true' ? true : actual === 'false' ? false : undefined) : actual
    return typeof value === 'boolean' ? verdict(op, order(String(value), String(expected))) : false
  }
  if (expected instanceof Date) {
    const millis = millisOf(actual)
    return millis === undefined || Number.isNaN(expected.getTime()) ? false : verdict(op, order(millis, expected.getTime()))
  }
  if (isDuration(expected)) {
    const seconds = secondsOf(actual)
    return seconds === undefined ? false : verdict(op, order(seconds, expected.seconds))
  }
  return false
}
