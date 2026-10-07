import { describe, expect, it } from 'vitest'
import { schema } from '../../test/support/schema'
import { checkOrderBy } from './check'
import { parseOrderBy } from './parse'
import { printOrderBy } from './print'

const items = (source: string) => {
  const result = parseOrderBy(source)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.items
}

describe('AIP-132 order_by', () => {
  it('parses direction, whitespace and subfields', () => {
    expect(items('foo desc, bar').map((i) => [i.path, i.direction])).toEqual([[['foo'], 'desc'], [['bar'], 'asc']])
    expect(printOrderBy(items('foo, bar desc'))).toBe(printOrderBy(items(' foo , bar   desc ')))
    expect(items('address.street desc')[0]!.path).toEqual(['address', 'street'])
    expect(items('')).toEqual([])
  })

  it('every spec example prints canonically', () => {
    expect(printOrderBy(items('foo,bar'))).toBe('foo, bar')
    expect(printOrderBy(items('foo desc, bar'))).toBe('foo desc, bar')
    expect(printOrderBy(items('foo, bar desc'))).toBe('foo, bar desc')
    expect(printOrderBy(items(' foo , bar desc '))).toBe('foo, bar desc')
    expect(printOrderBy(items('foo,bar desc'))).toBe('foo, bar desc')
    expect(printOrderBy(items('foo.bar, address.street asc'))).toBe('foo.bar, address.street')
  })

  it('print is stable', () => {
    const once = printOrderBy(items('createdAt  desc,total'))
    expect(printOrderBy(items(once))).toBe(once)
  })

  it('reports every syntax error with spans', () => {
    const result = parseOrderBy('a desc,, b up')
    expect(result.ok).toBe(false)
    expect(result.errors.map((e) => [e.code, e.span.start])).toEqual([['expected-field', 7], ['unexpected-token', 11]])
    expect(parseOrderBy('a desc,').errors[0]).toMatchObject({ code: 'expected-field' })
    expect(parseOrderBy('a b').errors[0]!.hint).toContain('desc')
    expect(parseOrderBy('a.').errors[0]).toMatchObject({ code: 'expected-field' })
    expect(parseOrderBy('a desc b').errors[0]).toMatchObject({ code: 'unexpected-token' })
    expect(parseOrderBy('desc desc').ok).toBe(true)
    expect(parseOrderBy('a DESC').ok).toBe(false)
  })

  it('handles unicode and hostile text', () => {
    expect(items('名前 desc')[0]!.path).toEqual(['名前'])
    expect(items("x';")[0]!.path).toEqual(["x';"])
    expect(parseOrderBy("x'; DROP TABLE x; --").ok).toBe(false)
  })

  it('checks against sortable fields, following nested fields and aliases', () => {
    expect(checkOrderBy(items('headline desc, createdAt'), schema)).toMatchObject({ ok: true, items: [{ path: ['title'], direction: 'desc' }, { path: ['createdAt'] }] })
    expect(checkOrderBy(items('author.name'), schema)).toMatchObject({ ok: true })
    const bad = checkOrderBy(items('nope, author.nope, title.x'), schema)
    expect(bad.ok ? [] : bad.errors.map((e) => e.code)).toEqual(['unknown-field', 'invalid-traversal', 'invalid-traversal'])
  })

  it('sortable: false is rejected, with a suggestion for typos', () => {
    const sortSchema = { fields: { id: {}, secret: { sortable: false }, nested: { fields: { hidden: { sortable: false } } } } }
    const result = checkOrderBy(items('secret, nested.hidden, idd'), sortSchema)
    expect(result.ok ? [] : result.errors.map((e) => e.code)).toEqual(['not-sortable', 'not-sortable', 'unknown-field'])
    expect(result.ok ? '' : result.errors[2]!.hint).toBe('Did you mean "id"?')
    expect(checkOrderBy(items('constructor'), sortSchema).ok).toBe(false)
  })

  it('subfields of a field that is not sortable are rejected', () => {
    const sortSchema = { fields: { nested: { fields: { hidden: { sortable: false, fields: { leaf: {} } } } } } }
    const result = checkOrderBy(items('nested.hidden.leaf'), sortSchema)
    expect(result.ok ? [] : result.errors.map((e) => e.code)).toEqual(['not-sortable'])
  })
})
