import { diagnostic } from '../../shared/diagnostic'
import { joinSpans, type Span } from '../../shared/span'
import type { Expr, Member } from '../ast'
import type { FilterError, FilterErrorCode } from '../errors'
import type { Token, TokenKind } from '../lexer/lexer'
import type { Extensions } from '../options'

export class ParseAbort extends Error {
  constructor(readonly error: FilterError) {
    super(error.message)
  }
}

export type Cursor = {
  tokens: Token[]
  pos: number
  errors: FilterError[]
  depth: number
  maxDepth: number
  extensions: Extensions
  /** Injected so operand parsing can parse parenthesised groups without a module cycle. */
  expression: (c: Cursor) => Expr | undefined
}

export const abort = (code: FilterErrorCode, message: string, hint: string, span: Span): never => {
  throw new ParseAbort(diagnostic(code, message, hint, span))
}

export const peek = (c: Cursor, offset = 0) => c.tokens[Math.min(c.pos + offset, c.tokens.length - 1)]!

export const next = (c: Cursor) => {
  const token = peek(c)
  if (token.kind !== 'eof') c.pos++
  return token
}

export const eat = (c: Cursor, kind: TokenKind) => (peek(c).kind === kind ? next(c) : undefined)

export const describe = (token: Token) => (token.kind === 'eof' ? 'end of input' : `"${token.text}"`)

export const expect = (c: Cursor, kind: TokenKind, what: string, hint: string) =>
  eat(c, kind) ?? abort('expected-token', `Expected ${what} but found ${describe(peek(c))}`, hint, peek(c).span)

export const withDepth = <T>(c: Cursor, span: Span, run: () => T): T => {
  if (c.depth >= c.maxDepth) {
    abort('too-deep', 'The filter is nested too deeply', `Nest at most ${c.maxDepth} levels`, span)
  }
  c.depth++
  try {
    return run()
  } finally {
    c.depth--
  }
}

const segmentKinds: TokenKind[] = ['text', 'and', 'or', 'not']

// member: value {"." field}. After a dot, numbers and keywords are valid field names.
export const parseMember = (c: Cursor): Member => {
  const first = expect(c, 'text', 'a field name or value', 'Text may not contain spaces or the characters ( ) - . = : < > ! ,')
  const path = [first.text]
  let span = first.span
  for (;;) {
    if (peek(c).kind !== 'dot') break
    const part = peek(c, 1)
    // `a.1.42` lexes the tail as the float 1.42; digits-only segments are indexes.
    const isIndex = part.kind === 'number' && /^\d+(\.\d+)?$/.test(part.text)
    if (!segmentKinds.includes(part.kind) && !isIndex) {
      abort('expected-token', `Expected a field name after "." but found ${describe(part)}`, 'Write traversals like customer.country', part.span)
    }
    next(c)
    next(c)
    path.push(...(isIndex ? part.text.split('.') : [part.text]))
    span = joinSpans(span, part.span)
  }
  return { kind: 'member', path, span }
}
