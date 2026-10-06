import type { Operand } from '../ast'
import { durationSeconds, isValidTimestamp } from '../datetime'
import type { FieldSpec, ValueType } from '../schema'

export type Problem = { message: string; hint: string }

const problem = (message: string, hint: string): Problem => ({ message, hint })
const expected = (what: string, hint: string) => problem(`Expected ${what}`, hint)

// Strings are converted to the field's type (AIP-160), and bare text counts as a string.
const textOf = (node: Operand) =>
  node.kind === 'string' ? node.value : node.kind === 'member' ? node.path.join('.') : undefined

const numeric = {
  integer: /^-?(\d+|0[xX][0-9a-fA-F]+)$/,
  number: /^-?\d+(\.\d+)?([eE][+-]?\d+)?$|^-?0[xX][0-9a-fA-F]+$/,
}

/** Whether a value of type `actual` can be compared with a field of type `wanted`. */
export const compatible = (wanted: ValueType, actual: ValueType) =>
  wanted === actual || wanted === 'any' || actual === 'any' || (['integer', 'number'].includes(wanted) && ['integer', 'number'].includes(actual))

/** Checks a literal or text against a type. Calls and arithmetic are checked by their return type. */
export const checkValue = (type: ValueType, spec: FieldSpec | undefined, node: Operand): Problem | undefined => {
  const text = textOf(node)
  switch (type) {
    case 'any':
      return undefined
    case 'string':
      return text !== undefined ? undefined : expected('a string', 'Quote text values: "..."')
    case 'enum':
      if (text !== undefined && spec?.values?.includes(text)) return undefined
      return problem('Invalid enum value', `Allowed values: ${(spec?.values ?? []).join(', ')}`)
    case 'integer':
    case 'number': {
      const raw = node.kind === 'number' ? node.raw : text
      if (raw !== undefined && numeric[type].test(raw)) return undefined
      return expected(type === 'integer' ? 'an integer' : 'a number', 'Write 42, -1.5 or 2.5e3, or quote a numeric string')
    }
    case 'boolean':
      if (node.kind === 'boolean' || text === 'true' || text === 'false') return undefined
      return expected('true or false', 'Write true or false')
    case 'timestamp':
      if (node.kind === 'timestamp' || (text !== undefined && isValidTimestamp(text))) return undefined
      return expected('an RFC-3339 timestamp', 'Use "2012-04-21T11:30:00Z"')
    case 'duration':
      if (node.kind === 'duration' || (text !== undefined && durationSeconds(text) !== undefined)) return undefined
      return expected('a duration', 'Use a number with a unit, for example 20s or 1.5s')
    case 'map':
    case 'message':
      return problem(`${type} fields cannot be compared`, 'Compare a nested field, or use field:key')
  }
}
