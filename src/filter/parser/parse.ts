import { diagnostic } from '../../shared/diagnostic'
import type { Expr } from '../ast'
import { FilterSyntaxError, type FilterError } from '../errors'
import { lex } from '../lexer/lexer'
import type { ParseOptions } from '../options'
import { next, peek, type Cursor } from './cursor'
import { parseExpression } from './expression'

/** Always carries every error found plus the best-effort tree, so editors keep working. */
export type FilterParse =
  | { ok: true; ast: Expr | undefined; errors: [] }
  | { ok: false; ast: Expr | undefined; errors: FilterError[] }

export const parseFilter = (source: string, options: ParseOptions = {}): FilterParse => {
  const maxLength = options.maxLength ?? 10_000
  if (source.length > maxLength) {
    const error = diagnostic('too-long', `The filter is longer than ${maxLength} characters`, 'Shorten the filter', { start: maxLength, end: source.length })
    return { ok: false, ast: undefined, errors: [error] }
  }
  const extensions = options.extensions ?? {}
  const lexed = lex(source, extensions)
  const c: Cursor = {
    tokens: lexed.tokens,
    pos: 0,
    errors: lexed.errors,
    depth: 0,
    maxDepth: options.maxDepth ?? 64,
    extensions,
    expression: parseExpression,
  }
  const parts: (Expr | undefined)[] = []
  while (peek(c).kind !== 'eof') {
    if (peek(c).kind === 'rparen') {
      const stray = next(c)
      c.errors.push(diagnostic('unexpected-token', 'Unmatched ")"', 'Remove it or add a matching "("', stray.span))
      continue
    }
    parts.push(parseExpression(c))
  }
  const defined = parts.filter((part) => part !== undefined)
  const ast: Expr | undefined =
    defined.length <= 1
      ? defined[0]
      : { kind: 'and', args: defined, span: { start: defined[0]!.span.start, end: defined[defined.length - 1]!.span.end } }
  const errors = [...c.errors].sort((a, b) => a.span.start - b.span.start)
  return errors.length === 0 ? { ok: true, ast, errors: [] } : { ok: false, ast, errors }
}

/** Convenience for callers that prefer exceptions. Returns undefined for an empty filter. */
export const parseFilterOrThrow = (source: string, options?: ParseOptions) => {
  const result = parseFilter(source, options)
  if (!result.ok) throw new FilterSyntaxError(result.errors)
  return result.ast
}
