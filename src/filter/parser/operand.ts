import { joinSpans } from '../../shared/span'
import type { Arg, Call, Operand } from '../ast'
import {
  abort, describe, eat, expect, next, parseMember, peek, withDepth, type Cursor,
} from './cursor'
import { durationFrom } from './duration'

const operandKinds = ['member', 'string', 'number', 'boolean', 'duration', 'timestamp', 'call', 'binary']

export const isOperand = (node: Arg): node is Operand => operandKinds.includes(node.kind)

const parseCall = (c: Cursor, name: string, start: Operand['span']): Call =>
  withDepth(c, start, () => {
    next(c)
    const args: Arg[] = []
    if (peek(c).kind !== 'rparen') {
      do args.push(parseArg(c))
      while (eat(c, 'comma'))
    }
    const close = expect(c, 'rparen', '")"', `Close the call to ${name}() with ")"`)
    return { kind: 'call', name, args, span: joinSpans(start, close.span) }
  })

/** A single value, member or function call; arithmetic and groups are handled by parseArg. */
export const parseOperand = (c: Cursor): Operand => {
  const token = peek(c)
  switch (token.kind) {
    case 'string':
      next(c)
      return { kind: 'string', value: token.value, span: token.span }
    case 'number':
      next(c)
      return { kind: 'number', value: Number(token.text), raw: token.text, span: token.span }
    case 'duration':
      next(c)
      return durationFrom(token)
    case 'timestamp':
      next(c)
      return { kind: 'timestamp', value: token.text, span: token.span }
    case 'minus': {
      const number = peek(c, 1)
      if (number.kind !== 'number' || number.span.start !== token.span.end) {
        abort('unexpected-token', `Expected a number after "-" but found ${describe(number)}`, 'Write negative numbers as -5, without a space', number.span)
      }
      next(c)
      next(c)
      const raw = `-${number.text}`
      return { kind: 'number', value: Number(raw), raw, span: joinSpans(token.span, number.span) }
    }
    case 'text': {
      const boolean = token.text === 'true' || token.text === 'false'
      if (boolean && peek(c, 1).kind !== 'dot' && !(peek(c, 1).kind === 'lparen' && peek(c, 1).span.start === token.span.end)) {
        next(c)
        return { kind: 'boolean', value: token.text === 'true', span: token.span }
      }
      const member = parseMember(c)
      // A call's "(" must touch the name: `York (a OR b)` is a term followed by a group.
      const call = peek(c).kind === 'lparen' && peek(c).span.start === member.span.end
      return call ? parseCall(c, member.path.join('.'), member.span) : member
    }
    default:
      return abort('unexpected-token', `Expected a value but found ${describe(token)}`, 'Values are text, "strings", numbers, true/false, durations, timestamps or function calls', token.span)
  }
}

const composite = (c: Cursor): Arg => {
  const open = next(c)
  return withDepth(c, open.span, () => {
    const inner = c.expression(c)
    expect(c, 'rparen', '")"', 'Close the group opened here')
    if (!inner) return abort('unexpected-token', 'Empty group', 'Put an expression inside the parentheses', open.span)
    return inner.kind === 'global' ? inner.value : inner
  })
}

const primary = (c: Cursor): Arg => (peek(c).kind === 'lparen' ? composite(c) : parseOperand(c))

const startsOperand = (c: Cursor) =>
  ['text', 'string', 'number', 'duration', 'timestamp', 'lparen', 'minus'].includes(peek(c, 1).kind)

// arg: comparable | composite, plus `+`/`-` chains when the arithmetic extension is on.
export const parseArg = (c: Cursor): Arg => {
  const first = primary(c)
  if (!c.extensions.arithmetic || !isOperand(first)) return first
  let left: Operand = first
  const nowOffset = c.extensions.arithmetic === 'now-offset'
  const isNow = () => left.kind === 'call' && left.name === 'now' && left.args.length === 0
  const allowed = () => !nowOffset || (isNow() && peek(c, 1).kind === 'duration')
  if (nowOffset && isNow() && (peek(c).kind === 'plus' || peek(c).kind === 'minus') && peek(c, 1).kind !== 'duration') {
    return abort('expected-token', `Expected a duration after "${peek(c).text}" but found ${describe(peek(c, 1))}`, 'Durations need a unit, for example now() - 30d', peek(c, 1).span)
  }
  while ((peek(c).kind === 'plus' || peek(c).kind === 'minus') && startsOperand(c) && allowed()) {
    const op = next(c).kind === 'plus' ? '+' : '-'
    const right = primary(c)
    if (!isOperand(right)) return abort('unexpected-token', 'Arithmetic needs values, not conditions', 'Use values on both sides of + and -', right.span)
    left = { kind: 'binary', op, left, right, span: joinSpans(left.span, right.span) }
  }
  return left
}

export const parseRight = (c: Cursor): Operand => {
  const start = peek(c)
  const arg = parseArg(c)
  if (!isOperand(arg)) abort('unexpected-token', 'A comparison needs a value on the right', 'Write field = value', start.span)
  return arg as Operand
}
