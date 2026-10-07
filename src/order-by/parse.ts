import { diagnostic } from '../shared/diagnostic'
import type { Span } from '../shared/span'
import type { OrderByError, OrderByItem, OrderByParse } from './types'

type Token = { kind: 'word' | 'comma' | 'dot'; text: string; span: Span }

const tokenize = (source: string) => {
  const tokens: Token[] = []
  const pattern = /,|\.|[^\s,.]+/g
  for (const match of source.matchAll(pattern)) {
    const start = match.index
    const kind = match[0] === ',' ? 'comma' : match[0] === '.' ? 'dot' : 'word'
    tokens.push({ kind, text: match[0], span: { start, end: start + match[0].length } })
  }
  return tokens
}

/** Accepts `asc` as well as the spec's `desc` suffix. Reports every error found. */
export const parseOrderBy = (source: string): OrderByParse => {
  const tokens = tokenize(source)
  const errors: OrderByError[] = []
  const items: OrderByItem[] = []
  const end = { start: source.length, end: source.length }
  let pos = 0

  const fail = (code: 'expected-field' | 'unexpected-token', message: string, hint: string, span: Span) =>
    errors.push(diagnostic(code, message, hint, span))

  const skipItem = () => {
    while (pos < tokens.length && tokens[pos]!.kind !== 'comma') pos++
    pos++
  }

  const parseItem = () => {
    const first = tokens[pos]
    if (!first || first.kind !== 'word') {
      fail('expected-field', `Expected a field name but found ${first ? `"${first.text}"` : 'end of input'}`, 'Write order_by like: createdAt desc, total', first?.span ?? end)
      return false
    }
    const path = [first.text]
    let last = first
    pos++
    while (tokens[pos]?.kind === 'dot') {
      const part = tokens[pos + 1]
      if (part?.kind !== 'word') {
        fail('expected-field', 'Expected a field name after "."', 'Write subfields like address.street', part?.span ?? end)
        return false
      }
      path.push(part.text)
      last = part
      pos += 2
    }
    const word = tokens[pos]
    let direction: 'asc' | 'desc' = 'asc'
    if (word?.kind === 'word') {
      if (word.text !== 'asc' && word.text !== 'desc') {
        fail('unexpected-token', `Expected "desc" or "," but found "${word.text}"`, 'Separate fields with commas; append " desc" for descending order', word.span)
        return false
      }
      direction = word.text
      last = word
      pos++
    }
    const after = tokens[pos]
    if (after && after.kind !== 'comma') {
      fail('unexpected-token', `Expected "," but found "${after.text}"`, 'Separate fields with commas', after.span)
      return false
    }
    items.push({ path, direction, span: { start: first.span.start, end: last.span.end } })
    return true
  }

  while (pos < tokens.length) {
    if (!parseItem()) {
      skipItem()
      continue
    }
    if (tokens[pos]?.kind === 'comma') {
      pos++
      if (pos >= tokens.length) fail('expected-field', 'Expected a field name after ","', 'Remove the trailing comma', end)
    }
  }
  return errors.length === 0 ? { ok: true, items, errors: [] } : { ok: false, items, errors }
}
