import type { Arg, Expr, Literal, Operand } from '../ast'
import { quote } from './quote'

const literal = (node: Literal) => {
  switch (node.kind) {
    case 'string':
      return quote(node.value)
    case 'number':
      return node.raw
    case 'boolean':
      return String(node.value)
    case 'duration':
      return `${node.amount}${node.unit}`
    case 'timestamp':
      return node.value
  }
}

const isNegative = (node: Operand) => node.kind === 'number' && node.raw.startsWith('-')

/** Prints an operand. */
export const printOperand = (node: Operand): string => {
  switch (node.kind) {
    case 'member':
      return node.path.join('.')
    case 'call':
      return `${node.name}(${node.args.map(printArg).join(', ')})`
    case 'binary':
      if (node.right.kind === 'binary') throw new Error('Arithmetic is left-associative; a binary on the right cannot be printed')
      return `${printOperand(node.left)} ${node.op} ${printOperand(node.right)}`
    default:
      return literal(node)
  }
}

const printArg = (node: Arg): string =>
  isExpr(node) ? `(${printFilter(node)})` : printOperand(node)

const operandKinds = ['member', 'string', 'number', 'boolean', 'duration', 'timestamp', 'binary']
const isExpr = (node: Arg): node is Expr => !operandKinds.includes(node.kind) && node.kind !== 'call'

const left = (node: Operand) => {
  if (isNegative(node)) throw new Error('A negative number cannot start a comparison; "-5 = x" parses as a negation')
  return printOperand(node)
}

const grouped = (parent: Expr['kind'], node: Expr) => {
  const nested = {
    and: ['and', 'or'],
    sequence: ['and', 'or', 'sequence'],
    or: ['and', 'or', 'sequence'],
    not: ['and', 'or', 'sequence', 'not'],
  }[parent as 'and' | 'sequence' | 'or' | 'not']
  return nested.includes(node.kind) ? `(${printFilter(node)})` : printFilter(node)
}

/**
 * Canonical text for an expression: AND/OR/NOT keywords (never "-"), quoted strings with
 * escapes, and parentheses around every OR, AND or sequence nested inside another group.
 */
export const printFilter = (node: Expr): string => {
  switch (node.kind) {
    case 'and':
      return node.args.map((arg) => grouped('and', arg)).join(' AND ')
    case 'or':
      return node.args.map((arg) => grouped('or', arg)).join(' OR ')
    case 'sequence':
      return node.args.map((arg) => grouped('sequence', arg)).join(' ')
    case 'not':
      return `NOT ${grouped('not', node.arg)}`
    case 'compare':
      return `${left(node.left)} ${node.op} ${printOperand(node.right)}`
    case 'has':
      return `${left(node.left)}:${printOperand(node.right)}`
    case 'present':
      return `${left(node.left)}:*`
    case 'global':
      return printOperand(node.value)
    case 'call':
      return printOperand(node)
  }
}
