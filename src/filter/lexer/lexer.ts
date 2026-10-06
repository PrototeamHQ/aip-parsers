import { diagnostic } from '../../shared/diagnostic'
import type { Span } from '../../shared/span'
import type { FilterError } from '../errors'
import type { Extensions } from '../options'
import { scanNumeric } from './number'
import { scanString } from './string'

export type TokenKind =
  | 'text' | 'string' | 'number' | 'duration' | 'timestamp'
  | 'and' | 'or' | 'not'
  | 'lparen' | 'rparen' | 'comma' | 'dot' | 'has'
  | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'
  | 'minus' | 'plus' | 'eof'

/** `text` is the source slice; `value` is the decoded string for string tokens. */
export type Token = { kind: TokenKind; text: string; value: string; span: Span }

const punctuation: Record<string, TokenKind> = {
  '(': 'lparen', ')': 'rparen', ',': 'comma', '.': 'dot', ':': 'has',
  '=': 'eq', '<': 'lt', '>': 'gt', '-': 'minus',
}
const keywords: Record<string, TokenKind> = { AND: 'and', OR: 'or', NOT: 'not' }

const afterNow = (tokens: Token[]) => {
  const [rparen, lparen, name] = [tokens.at(-1), tokens.at(-2), tokens.at(-3)]
  return rparen?.kind === 'rparen' && lparen?.kind === 'lparen' && name?.text === 'now'
}

export const lex = (source: string, extensions: Extensions = {}) => {
  const tokens: Token[] = []
  const errors: FilterError[] = []
  const special = (char: string | undefined) =>
    char !== undefined && (char in punctuation || char === '!' || (extensions.arithmetic === true && char === '+'))
  const isDelimiter = (char: string | undefined) =>
    char === undefined || /\s/.test(char) || special(char) || char === '"' || char === "'"
  const push = (kind: TokenKind, start: number, end: number, value = source.slice(start, end)) =>
    tokens.push({ kind, text: source.slice(start, end), value, span: { start, end } })

  const surrogate = source.isWellFormed() ? -1 : source.search(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/)
  if (surrogate >= 0) {
    errors.push(diagnostic('invalid-unicode', 'The filter contains an unpaired surrogate', 'Use well-formed UTF-16 text', { start: surrogate, end: surrogate + 1 }))
  }

  let i = 0
  while (i < source.length) {
    const char = source[i]!
    if (/\s/.test(char)) {
      i++
      continue
    }
    if (char === '"' || char === "'") {
      const scan = scanString(source, i)
      errors.push(...scan.errors)
      if (scan.value !== undefined) push('string', i, scan.end, scan.value)
      i = scan.end
      continue
    }
    if (/[0-9]/.test(char)) {
      const scan = scanNumeric(source, i, isDelimiter, extensions)
      if (scan?.kind === 'error') errors.push(scan.error)
      else if (scan) push(scan.kind, i, scan.end)
      if (scan) {
        i = scan.end
        continue
      }
    }
    if (char === '!' || char === '<' || char === '>') {
      const twoChars = source[i + 1] === '='
      if (char === '!' && !twoChars) {
        errors.push(diagnostic('unexpected-character', 'Unexpected character "!"', 'Use != for "not equal" or NOT / - for negation', { start: i, end: i + 1 }))
        i++
        continue
      }
      push(char === '!' ? 'ne' : char === '<' ? (twoChars ? 'le' : 'lt') : twoChars ? 'ge' : 'gt', i, i + (twoChars ? 2 : 1))
      i += twoChars ? 2 : 1
      continue
    }
    if (Object.hasOwn(punctuation, char)) {
      push(punctuation[char]!, i, i + 1)
      i++
      continue
    }
    // In now-offset mode "+" only counts directly after a `now()` call.
    const offsetPlus = extensions.arithmetic === 'now-offset' && afterNow(tokens)
    if (char === '+' && (extensions.arithmetic === true || offsetPlus)) {
      push('plus', i, i + 1)
      i++
      continue
    }
    let end = i + 1
    while (!isDelimiter(source[end])) end++
    const text = source.slice(i, end)
    push(Object.hasOwn(keywords, text) ? keywords[text]! : 'text', i, end)
    i = end
  }
  push('eof', source.length, source.length)
  return { tokens, errors }
}
