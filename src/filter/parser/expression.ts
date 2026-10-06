import { diagnostic } from '../../shared/diagnostic'
import { joinSpans } from '../../shared/span'
import type { CompareOp, Expr, Operand } from '../ast'
import type { TokenKind } from '../lexer/lexer'
import {
  abort, describe, eat, next, ParseAbort, peek, withDepth, type Cursor,
} from './cursor'
import { parseOperand, parseRight } from './operand'

const comparators: Partial<Record<TokenKind, CompareOp>> = {
  eq: '=', ne: '!=', lt: '<', le: '<=', gt: '>', ge: '>=',
}
const termStarts: TokenKind[] = ['text', 'string', 'number', 'duration', 'timestamp', 'not', 'minus', 'lparen']

const group = (kind: 'and' | 'or' | 'sequence', items: (Expr | undefined)[]): Expr | undefined => {
  const args = items.filter((item) => item !== undefined)
  if (args.length <= 1) return args[0]
  return { kind, args, span: joinSpans(args[0]!.span, args[args.length - 1]!.span) }
}

// Skips to the next boundary so parsing can continue after an error.
const sync = (c: Cursor) => {
  let depth = 0
  for (;;) {
    const { kind } = peek(c)
    if (kind === 'eof') return
    if (depth === 0 && (kind === 'and' || kind === 'or' || kind === 'rparen')) return
    if (kind === 'lparen') depth++
    if (kind === 'rparen') depth--
    next(c)
  }
}

// restriction: comparable [comparator arg]
const parseRestriction = (c: Cursor): Expr => {
  const left: Operand = parseOperand(c)
  const token = peek(c)
  if (token.kind === 'has') {
    next(c)
    const star = peek(c)
    if (star.kind === 'text' && star.text === '*') {
      next(c)
      return { kind: 'present', left, span: joinSpans(left.span, star.span) }
    }
    const right = parseRight(c)
    return { kind: 'has', left, right, span: joinSpans(left.span, right.span) }
  }
  const op = comparators[token.kind]
  if (op) {
    next(c)
    const right = parseRight(c)
    return { kind: 'compare', op, left, right, span: joinSpans(left.span, right.span) }
  }
  return left.kind === 'call' ? left : { kind: 'global', value: left, span: left.span }
}

// simple: restriction | composite
const parseSimple = (c: Cursor): Expr | undefined => {
  const open = peek(c)
  if (open.kind !== 'lparen') return parseRestriction(c)
  next(c)
  return withDepth(c, open.span, () => {
    const inner = parseExpression(c)
    if (!eat(c, 'rparen')) {
      c.errors.push(diagnostic('expected-token', `Expected ")" but found ${describe(peek(c))}`, 'Close the group opened here', open.span))
    }
    return inner
  })
}

// term: [NOT | "-"] simple. A lone "-5" is the number -5, as in aip-go.
const parseTerm = (c: Cursor): Expr | undefined => {
  const token = peek(c)
  if (token.kind !== 'not' && token.kind !== 'minus') {
    if (!termStarts.includes(token.kind)) {
      return abort('unexpected-token', `Unexpected ${describe(token)}`, 'Expected a field, a value or "("', token.span)
    }
    return withDepth(c, token.span, () => parseSimple(c))
  }
  next(c)
  const following = peek(c)
  const negativeNumber = following.kind === 'minus' && peek(c, 1).kind === 'number' && peek(c, 1).span.start === following.span.end
  if (following.kind === 'not' || (following.kind === 'minus' && !negativeNumber)) {
    abort('unexpected-token', 'Negations cannot be stacked', 'Group the inner one: NOT (NOT a)', following.span)
  }
  const arg = withDepth(c, token.span, () => parseSimple(c))
  if (!arg) return undefined
  const span = joinSpans(token.span, arg.span)
  if (token.kind === 'minus' && arg.kind === 'global' && arg.value.kind === 'number' && !arg.value.raw.startsWith('-')) {
    const { raw, value } = arg.value
    return { kind: 'global', value: { kind: 'number', value: -value, raw: `-${raw}`, span }, span }
  }
  return { kind: 'not', arg, span }
}

const parseTermRecovering = (c: Cursor) => {
  try {
    return parseTerm(c)
  } catch (error) {
    if (!(error instanceof ParseAbort)) throw error
    c.errors.push(error.error)
    sync(c)
    return undefined
  }
}

// factor: term {OR term}. OR binds tighter than AND.
const parseFactor = (c: Cursor) => {
  const items = [parseTermRecovering(c)]
  while (eat(c, 'or')) items.push(parseTermRecovering(c))
  return group('or', items)
}

// sequence: factor {factor}, whitespace-separated terms.
const parseSequence = (c: Cursor) => {
  const items = [parseFactor(c)]
  while (termStarts.includes(peek(c).kind)) items.push(parseFactor(c))
  return group('sequence', items)
}

// expression: sequence {AND sequence}
export const parseExpression = (c: Cursor): Expr | undefined => {
  const items = [parseSequence(c)]
  while (eat(c, 'and')) items.push(parseSequence(c))
  return group('and', items)
}
