import { diagnostic } from '../../shared/diagnostic'
import type { Operand } from '../ast'
import type { ValueType } from '../schema'
import { checkCall, type CheckedOperand } from './call'
import type { CheckContext } from './context'

const arithmetic = (left: ValueType, right: ValueType, op: '+' | '-'): ValueType | undefined => {
  if (left === 'timestamp' && right === 'duration') return 'timestamp'
  if (left === 'timestamp' && right === 'timestamp' && op === '-') return 'duration'
  if (left === 'duration' && right === 'duration') return 'duration'
  if ((left === 'integer' || left === 'number') && (right === 'integer' || right === 'number')) {
    return left === 'integer' && right === 'integer' ? 'integer' : 'number'
  }
  return undefined
}

const literalTypes = { number: 'number', boolean: 'boolean', duration: 'duration', timestamp: 'timestamp' } as const

/**
 * Checks a value operand (never a field reference): calls are validated against the registry,
 * arithmetic against operand types. Literals and text keep an undefined type until compared.
 */
export const checkOperand = (ctx: CheckContext, node: Operand): CheckedOperand | undefined => {
  switch (node.kind) {
    case 'call': {
      const checked = checkCall(ctx, node, checkOperand)
      return checked && { node: checked.call, type: checked.returns }
    }
    case 'binary': {
      const left = checkOperand(ctx, node.left)
      const right = checkOperand(ctx, node.right)
      if (!left || !right) return undefined
      const type = left.type && right.type ? arithmetic(left.type, right.type, node.op) : left.type ?? right.type ?? 'number'
      if (!type) {
        ctx.errors.push(diagnostic('invalid-value', `Cannot apply "${node.op}" to ${left.type} and ${right.type}`, 'Add a duration to a timestamp, or combine numbers', node.span))
        return undefined
      }
      return { node: { ...node, left: left.node, right: right.node }, type }
    }
    case 'number':
    case 'boolean':
    case 'duration':
    case 'timestamp':
      return { node, type: literalTypes[node.kind] }
    default:
      return { node, type: undefined }
  }
}
