// Every example in https://google.aip.dev/160, checked for the tree we build and for the
// meaning the spec gives it when evaluated against plain objects.
import { describe, expect, it } from 'vitest'
import { evaluateFilter, parseFilter } from '../../src/filter'
import { parse, tree } from '../support/helpers'

const holds = (source: string, record: unknown) => evaluateFilter(parse(source), record)

describe('literals', () => {
  it('whitespace-separated literals are a sequence (fuzzy AND)', () => {
    expect(tree('Victor Hugo')).toBe('(sequence Victor Hugo)')
    expect(holds('Victor Hugo', { author: 'Victor Hugo' })).toBe(true)
    expect(holds('Victor Hugo', { author: 'Victor' })).toBe(false)
  })

  it('numbers: integers, floats and exponents', () => {
    expect(tree('a = 42')).toBe('(= a 42)')
    expect(tree('a = 2.5')).toBe('(= a 2.5)')
    expect(tree('a = 2.997e9')).toBe('(= a 2.997e9)')
    expect(holds('a = 2.997e9', { a: 2997000000 })).toBe(true)
  })

  it('durations are a number with an s suffix', () => {
    expect(tree('a = 20s')).toBe('(= a 20s)')
    expect(tree('a = 1.2s')).toBe('(= a 1.2s)')
    expect(holds('a < 20s', { a: { seconds: 19 } })).toBe(true)
    expect(holds('a = 1.2s', { a: 1.2 })).toBe(true)
  })

  it('timestamps are RFC-3339 with UTC offsets', () => {
    const ts = '2012-04-21T11:30:00-04:00'
    expect(tree(`a = "${ts}"`)).toBe(`(= a "${ts}")`)
    expect(tree(`a = ${ts}`)).toBe(`(= a ${ts})`)
    expect(holds(`a = ${ts}`, { a: new Date('2012-04-21T15:30:00Z') })).toBe(true)
    expect(holds(`a > ${ts}`, { a: new Date('2012-04-21T16:00:00Z') })).toBe(true)
    expect(holds(`a > ${ts}`, { a: '2012-04-21T12:00:00Z' })).toBe(false)
  })
})

describe('logical operators', () => {
  it('AND and OR', () => {
    expect(tree('a AND b')).toBe('(and a b)')
    expect(tree('a OR b OR c')).toBe('(or a b c)')
    expect(holds('x = 1 AND y = 2', { x: 1, y: 2 })).toBe(true)
    expect(holds('x = 1 AND y = 2', { x: 1, y: 3 })).toBe(false)
    expect(holds('x = 1 OR y = 2 OR z = 3', { z: 3 })).toBe(true)
  })

  it('OR binds tighter than AND: a AND b OR c is a AND (b OR c)', () => {
    expect(tree('a AND b OR c')).toBe('(and a (or b c))')
    expect(holds('x = 1 AND y = 2 OR z = 3', { x: 1, z: 3 })).toBe(true)
    expect(holds('x = 1 AND y = 2 OR z = 3', { x: 0, y: 2 })).toBe(false)
    expect(holds('x = 1 AND y = 2 OR z = 3', { x: 0, z: 3 })).toBe(false)
  })
})

describe('negation', () => {
  it('NOT a and -a are the same', () => {
    expect(tree('NOT a')).toBe('(not a)')
    expect(tree('-a')).toBe('(not a)')
    expect(holds('NOT a = 1', { a: 2 })).toBe(true)
    expect(holds('-a = 1', { a: 1 })).toBe(false)
  })
})

describe('comparison operators', () => {
  it.each([
    ['a = true', { a: true }, { a: false }],
    ['a != 42', { a: 41 }, { a: 42 }],
    ['a < 42', { a: 41 }, { a: 42 }],
    ['a > "foo"', { a: 'fop' }, { a: 'foo' }],
    ['a <= "foo"', { a: 'foo' }, { a: 'fop' }],
    ['a >= 42', { a: 42 }, { a: 41 }],
    ['a = "*.foo"', { a: 'x.foo' }, { a: 'x.foo.bar' }],
  ])('%s', (source, yes, no) => {
    expect(holds(source, yes)).toBe(true)
    expect(holds(source, no)).toBe(false)
  })

  it('a = "*.foo" is a wildcard match', () => {
    expect(holds('a = "*.foo"', { a: '.foo' })).toBe(true)
    expect(holds('a = "f*o*"', { a: 'foo' })).toBe(true)
    expect(holds('a = "*"', { a: '' })).toBe(true)
  })
})

describe('traversal', () => {
  it.each([
    ['a.b = true', { a: { b: true } }, { a: { b: false } }],
    ['a.b > 42', { a: { b: 43 } }, { a: { b: 42 } }],
    ['a.b.c = "foo"', { a: { b: { c: 'foo' } } }, { a: { b: { c: 'bar' } } }],
  ])('%s', (source, yes, no) => {
    expect(holds(source, yes)).toBe(true)
    expect(holds(source, no)).toBe(false)
    expect(holds(source, {})).toBe(false)
  })
})

describe('has operator', () => {
  it.each([
    ['r:42', { r: [1, 42] }, { r: [1, 2] }],
    ['r.foo:42', { r: [{ foo: 1 }, { foo: 42 }] }, { r: [{ foo: 1 }] }],
    ['m:foo', { m: { foo: 1 } }, { m: { bar: 1 } }],
    ['m.foo:*', { m: { foo: 1 } }, { m: { bar: 1 } }],
    ['m.foo:42', { m: { foo: 42 } }, { m: { foo: 1 } }],
    ['r:*', { r: [1] }, {}],
    ['p:*', { p: { k: 1 } }, {}],
    ['m:*', { m: { x: 1 } }, { m: null }],
  ])('%s', (source, yes, no) => {
    expect(holds(source, yes)).toBe(true)
    expect(holds(source, no)).toBe(false)
  })

  it('parses presence and key tests', () => {
    expect(tree('r:42')).toBe('(: r 42)')
    expect(tree('m:foo')).toBe('(: m foo)')
    expect(tree('m.foo:*')).toBe('(: m.foo *)')
    expect(tree('r.foo:42')).toBe('(: r.foo 42)')
  })
})

describe('functions', () => {
  it('parses name(args...) for any name', () => {
    expect(tree('f(a, 1, "x")')).toBe('(call f a 1 "x")')
    expect(parseFilter('anything()').ok).toBe(true)
  })
})
