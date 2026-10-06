import { diagnostic } from '../../shared/diagnostic'
import type { Compare, Expr, Has, Operand } from '../ast'
import type { FilterError } from '../errors'
import type { FieldSpec, Schema, ValueType } from '../schema'
import { checkCall } from './call'
import type { CheckContext } from './context'
import { resolveMember } from './field'
import { checkOperand } from './operand'
import { checkValue, compatible } from './value'

export type CheckResult =
  | { ok: true; ast: Expr }
  | { ok: false; errors: FilterError[] }

const ordered: ValueType[] = ['string', 'integer', 'number', 'timestamp', 'duration', 'any']

type Subject = { node: Operand; type: ValueType | undefined; spec: FieldSpec | undefined }

// The left side of a restriction: a field reference, a function call or a literal.
const checkSubject = (ctx: CheckContext, node: Operand): Subject | undefined => {
  if (node.kind === 'member') {
    const resolved = resolveMember(ctx, node)
    return resolved && { node: resolved, type: resolved.field!.spec.type, spec: resolved.field!.spec }
  }
  const checked = checkOperand(ctx, node)
  return checked && { ...checked, spec: undefined }
}

const operatorError = (ctx: CheckContext, message: string, hint: string, node: Expr) => {
  ctx.errors.push(diagnostic('operator-not-allowed', message, hint, node.span))
  return undefined
}

// A value on the right: literals and text are checked against `type`, calls by return type.
const checkRight = (ctx: CheckContext, subject: Subject, node: Operand) => {
  if (!subject.type) return checkOperand(ctx, node)?.node
  const checked = checkOperand(ctx, node)
  if (!checked) return undefined
  const problem = checked.type && (node.kind === 'call' || node.kind === 'binary')
    ? compatible(subject.type, checked.type) ? undefined : { message: `Expected ${subject.type} but got ${checked.type}`, hint: 'Compare values of the same type' }
    : checkValue(subject.type, subject.spec, checked.node)
  if (problem) ctx.errors.push(diagnostic('invalid-value', problem.message, problem.hint, node.span))
  return problem ? undefined : checked.node
}

const checkCompare = (ctx: CheckContext, node: Compare): Expr | undefined => {
  const subject = checkSubject(ctx, node.left)
  if (!subject) return undefined
  const type = subject.type
  if (subject.spec?.repeated) return operatorError(ctx, `"${node.op}" is not supported on repeated fields`, 'Use field:value to test membership', node)
  if (type === 'map' || type === 'message') return operatorError(ctx, `${type} fields cannot be compared`, 'Use field:key, or compare a nested field', node)
  if (type && !['=', '!='].includes(node.op) && !ordered.includes(type)) {
    return operatorError(ctx, `"${node.op}" is not supported for ${type} fields`, 'Supported: = !=', node)
  }
  const wildcard = (node.op === '=' || node.op === '!=') && node.right.kind === 'string' && node.right.value.includes('*')
  if (wildcard && type && type !== 'string' && type !== 'any') {
    ctx.errors.push(diagnostic('wildcard-not-allowed', `Wildcards are only supported on string fields, not ${type}`, 'Remove the "*"', node.right.span))
    return undefined
  }
  const right = wildcard ? node.right : checkRight(ctx, subject, node.right)
  return right && { ...node, left: subject.node, right }
}

// `:` matches an element of a repeated field, a key of a map or message, or a single value.
const checkHas = (ctx: CheckContext, node: Has): Expr | undefined => {
  const subject = checkSubject(ctx, node.left)
  if (!subject) return undefined
  const { type, spec } = subject
  const keyed = !spec?.repeated && (type === 'map' || type === 'message')
  const element: Subject = keyed ? { ...subject, type: 'string' } : subject
  const right = checkRight(ctx, element, node.right)
  return right && { ...node, left: subject.node, right }
}

const checkExpr = (ctx: CheckContext, node: Expr): Expr | undefined => {
  switch (node.kind) {
    case 'sequence':
    case 'and':
    case 'or': {
      const args = node.args.map((arg) => checkExpr(ctx, arg))
      return args.every((arg) => arg) ? { ...node, args: args as Expr[] } : undefined
    }
    case 'not': {
      const arg = checkExpr(ctx, node.arg)
      return arg && { ...node, arg }
    }
    case 'compare':
      return checkCompare(ctx, node)
    case 'has':
      return checkHas(ctx, node)
    case 'present': {
      const subject = checkSubject(ctx, node.left)
      return subject && { ...node, left: subject.node }
    }
    case 'global':
      return node
    case 'call': {
      const checked = checkCall(ctx, node, checkOperand)
      if (checked && checked.returns !== 'boolean') {
        ctx.errors.push(diagnostic('not-boolean', `${node.name}() returns ${checked.returns}, not a condition`, 'Compare its result: f(x) > 1', node.span))
        return undefined
      }
      return checked?.call
    }
  }
}

/**
 * Validates a parsed filter against a schema: fields exist and are filterable, values match
 * field types, operators suit the type and calls match the registry. Returns the tree with
 * members resolved (`member.field`) and aliases canonicalised, or every error found.
 */
export const checkFilter = (ast: Expr, schema: Schema): CheckResult => {
  const ctx: CheckContext = { schema, errors: [] }
  const checked = checkExpr(ctx, ast)
  if (!checked || ctx.errors.length > 0) {
    return { ok: false, errors: [...ctx.errors].sort((a, b) => a.span.start - b.span.start) }
  }
  return { ok: true, ast: checked }
}
