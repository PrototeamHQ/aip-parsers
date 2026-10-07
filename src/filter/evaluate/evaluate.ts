import type { Arg, Call, Expr, Has, Compare, Operand } from '../ast'
import type { FunctionSpec } from '../schema'
import { compareValue } from './compare'
import { Decimal, decimalOf } from './decimal'
import { elements, resolvePath } from './resolve'
import { defaultSearch } from './search'
import { isDuration, literalValue, millisOf, secondsOf, textOf } from './values'

export type EvaluateOptions = {
  /** Implementations for function calls; usually the `functions` of the checking schema. */
  functions?: Record<string, FunctionSpec>
  /** Global restrictions such as `hello`. Defaults to a case-insensitive substring search. */
  search?: (text: string, record: unknown) => boolean
}

type Context = { record: unknown; options: EvaluateOptions }

const isOperand = (node: Arg): node is Operand =>
  ['member', 'string', 'number', 'boolean', 'duration', 'timestamp', 'call', 'binary'].includes(node.kind)

const arithmetic = (op: '+' | '-', left: unknown, right: unknown) => {
  const sign = op === '+' ? 1 : -1
  if (left instanceof Date && isDuration(right)) return new Date(left.getTime() + sign * right.seconds * 1000)
  if (left instanceof Date && right instanceof Date && op === '-') return { seconds: (left.getTime() - right.getTime()) / 1000 }
  if (isDuration(left) && isDuration(right)) return { seconds: left.seconds + sign * right.seconds }
  const a = left instanceof Decimal ? left.toNumber() : left
  const b = right instanceof Decimal ? right.toNumber() : right
  return typeof a === 'number' && typeof b === 'number' ? a + sign * b : undefined
}

const callValue = (call: Call, ctx: Context): unknown => {
  const fn = ctx.options.functions?.[call.name]
  if (!fn?.evaluate) throw new Error(`Function "${call.name}" has no evaluate implementation`)
  const args = call.args.map((arg, i) => {
    const param = fn.params[i] ?? fn.rest
    if (arg.kind === 'member' && param?.type === 'field') return elements(resolvePath(ctx.record, arg.path))
    return isOperand(arg) ? operandValue(arg, ctx) : evaluateExpr(arg, ctx)
  })
  return fn.evaluate(...args)
}

// Member operands are plain text here; field references are handled by `candidates`.
const operandValue = (node: Operand, ctx: Context): unknown => {
  switch (node.kind) {
    case 'member':
      return node.path.join('.')
    case 'call':
      return callValue(node, ctx)
    case 'binary':
      return arithmetic(node.op, operandValue(node.left, ctx), operandValue(node.right, ctx))
    default:
      return literalValue(node)
  }
}

const candidates = (node: Operand, ctx: Context) =>
  node.kind === 'member' ? resolvePath(ctx.record, node.path) : [operandValue(node, ctx)]

const matches = (op: '=' | '<' | '<=' | '>' | '>=', values: unknown[], expected: unknown) =>
  elements(values).some((value) => compareValue(op, value, expected))

// A checked filter knows the field type, which settles how a quoted value is converted.
const convertFor = (left: Operand, expected: unknown) => {
  const type = left.kind === 'member' ? left.field?.spec.type : undefined
  if (typeof expected !== 'string' || !type) return expected
  if (type === 'timestamp') return millisOf(expected) === undefined ? expected : new Date(millisOf(expected)!)
  if (type === 'duration') return secondsOf(expected) === undefined ? expected : { seconds: secondsOf(expected)! }
  if (type === 'integer' || type === 'number') return decimalOf(expected) ?? expected
  if (type === 'boolean') return expected === 'true' ? true : expected === 'false' ? false : expected
  return expected
}

const evaluateCompare = (node: Compare, ctx: Context) => {
  const expected = convertFor(node.left, operandValue(node.right, ctx))
  const values = candidates(node.left, ctx)
  if (node.op === '!=') return !matches('=', values, expected)
  return matches(node.op, values, expected)
}

// `:` on arrays matches an element, on maps and messages a key, otherwise the value itself.
const evaluateHas = (node: Has, ctx: Context) => {
  const expected = operandValue(node.right, ctx)
  const key = textOf(node.right)
  return candidates(node.left, ctx).some((value) => {
    if (Array.isArray(value)) return value.some((item) => compareValue('=', item, expected))
    if (value instanceof Map) return key !== undefined && value.has(key)
    const keyed = typeof value === 'object' && value !== null && !(value instanceof Date) && !isDuration(value) && !(value instanceof Decimal)
    if (keyed) return key !== undefined && Object.hasOwn(value, key)
    return compareValue('=', value, expected)
  })
}

const evaluateExpr = (node: Expr, ctx: Context): boolean => {
  switch (node.kind) {
    case 'sequence':
    case 'and':
      return node.args.every((arg) => evaluateExpr(arg, ctx))
    case 'or':
      return node.args.some((arg) => evaluateExpr(arg, ctx))
    case 'not':
      return !evaluateExpr(node.arg, ctx)
    case 'compare':
      return evaluateCompare(node, ctx)
    case 'has':
      return evaluateHas(node, ctx)
    case 'present':
      return candidates(node.left, ctx).some((value) => value !== undefined && value !== null)
    case 'global':
      return (ctx.options.search ?? defaultSearch)(textOf(node.value) ?? String(operandValue(node.value, ctx)), ctx.record)
    case 'call':
      return callValue(node, ctx) === true
  }
}

/**
 * Pass a checked filter so field types decide how quoted values convert.
 * Throws when a called function has no `evaluate` implementation.
 */
export const evaluateFilter = (ast: Expr, record: unknown, options: EvaluateOptions = {}) =>
  evaluateExpr(ast, { record, options })
