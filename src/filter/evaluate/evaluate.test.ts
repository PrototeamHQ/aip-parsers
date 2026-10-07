import { describe, expect, it } from 'vitest'
import { parse } from '../../../test/support/helpers'
import { schema } from '../../../test/support/schema'
import { checkFilter } from '../check/check'
import { globMatch } from './glob'
import { evaluateFilter } from './evaluate'

const options = { extensions: { arithmetic: true, durationUnits: true } }
const holds = (source: string, record: unknown) => evaluateFilter(parse(source, options), record, { functions: schema.functions })
const checkedHolds = (source: string, record: unknown) => {
  const checked = checkFilter(parse(source, options), schema)
  if (!checked.ok) throw new Error(JSON.stringify(checked.errors))
  return evaluateFilter(checked.ast, record, { functions: schema.functions })
}

describe('comparison semantics', () => {
  it('strings', () => {
    expect(holds('title = "a"', { title: 'a' })).toBe(true)
    expect(holds('title != "a"', { title: 'b' })).toBe(true)
    expect(holds('title < "b"', { title: 'a' })).toBe(true)
    expect(holds('title = "A"', { title: 'a' })).toBe(false)
    expect(holds('title = paid', { title: 'paid' })).toBe(true)
  })

  it('numbers compare numerically and exactly', () => {
    expect(holds('n > 9', { n: 10 })).toBe(true)
    expect(holds('n = 9007199254740993', { n: 9007199254740993n })).toBe(true)
    expect(holds('n = 9007199254740993', { n: '9007199254740993' })).toBe(true)
    expect(holds('n < 9007199254740993', { n: '9007199254740992' })).toBe(true)
    expect(holds('n = 100.50', { n: '100.5' })).toBe(true)
    expect(holds('n > 100.49', { n: '100.50' })).toBe(true)
    expect(holds('n = 0xff', { n: 255 })).toBe(true)
    expect(holds('n = 1e3', { n: 1000 })).toBe(true)
    expect(holds('n = "10"', { n: 10 })).toBe(true)
    expect(holds('n > "9"', { n: 10 })).toBe(true)
    expect(holds('n > 5', { n: 'text' })).toBe(false)
  })

  it('negative hex and quoted exponent or hex numbers', () => {
    expect(holds('n = -0x10', { n: -16 })).toBe(true)
    expect(holds('n = "1e3"', { n: 1000 })).toBe(true)
    expect(checkedHolds('price = "1e3"', { price: 1000 })).toBe(true)
    expect(checkedHolds('id = "0x10"', { id: 16 })).toBe(true)
    expect(checkedHolds('id = "-0x10"', { id: -16 })).toBe(true)
  })

  it('booleans', () => {
    expect(holds('a = true', { a: true })).toBe(true)
    expect(holds('a = true', { a: 'true' })).toBe(true)
    expect(holds('a = "false"', { a: false })).toBe(true)
    expect(holds('a = true', { a: 1 })).toBe(false)
  })

  it('timestamps from Dates and ISO strings, across offsets', () => {
    expect(holds('t = 2012-04-21T11:30:00-04:00', { t: new Date('2012-04-21T15:30:00Z') })).toBe(true)
    expect(holds('t < 2012-04-21T11:30:00-04:00', { t: '2012-04-21T12:00:00Z' })).toBe(true)
    expect(holds('t > now() - 30d', { t: new Date('2024-04-01T00:00:00Z') })).toBe(false)
    expect(holds('t > 2024-05-02T00:00:00Z', { t: new Date('2024-05-03T00:00:00Z') })).toBe(true)
  })

  it('durations', () => {
    expect(holds('d < 1h', { d: { seconds: 3599 } })).toBe(true)
    expect(holds('d = 90s', { d: '1.5m' })).toBe(true)
    expect(holds('d >= 1d', { d: 86400 })).toBe(true)
  })

  it('a checked filter converts quoted values by field type', () => {
    expect(checkedHolds('createdAt > "2012-04-21T11:30:00-04:00"', { createdAt: '2012-04-21T12:00:00Z' })).toBe(false)
    expect(checkedHolds('id > "9"', { id: 10 })).toBe(true)
    expect(checkedHolds('ttl = "1m"', { ttl: 60 })).toBe(true)
  })

  it('missing and null values: = is false, != is true', () => {
    expect(holds('a = 1', {})).toBe(false)
    expect(holds('a != 1', {})).toBe(true)
    expect(holds('a = 1', { a: null })).toBe(false)
    expect(holds('NOT a = 1', {})).toBe(true)
    expect(holds('a < 1', {})).toBe(false)
  })

  it('wildcards', () => {
    expect(holds('a = "*.foo"', { a: 'x.foo' })).toBe(true)
    expect(holds('a = "*.foo"', { a: 'x.foo.bar' })).toBe(false)
    expect(holds('a = "f*"', { a: 'foo' })).toBe(true)
    expect(holds('a != "f*"', { a: 'foo' })).toBe(false)
    expect(holds('a = "a*b*c"', { a: 'aXXbYYc' })).toBe(true)
    expect(holds('a = "*"', { a: 'anything' })).toBe(true)
    expect(holds('a = "x*"', { a: 5 })).toBe(false)
  })

  it('glob matching is linear on hostile patterns', () => {
    const start = Date.now()
    expect(globMatch('*a*a*a*a*a*a*a*a*a*a*b', 'a'.repeat(5000))).toBe(false)
    expect(Date.now() - start).toBeLessThan(2000)
  })
})

describe('paths and repeated fields', () => {
  it('traverses nested objects and maps', () => {
    expect(holds('a.b.c = 1', { a: { b: { c: 1 } } })).toBe(true)
    expect(holds('m.k = 1', { m: new Map([['k', 1]]) })).toBe(true)
    expect(holds('a.b = 1', { a: 5 })).toBe(false)
  })

  it('arrays on the path match per element', () => {
    expect(holds('items.qty > 5', { items: [{ qty: 1 }, { qty: 9 }] })).toBe(true)
    expect(holds('items.qty > 5', { items: [{ qty: 1 }] })).toBe(false)
    expect(holds('items.qty != 1', { items: [{ qty: 1 }, { qty: 2 }] })).toBe(false)
  })

  it('does not follow prototype keys', () => {
    expect(holds('constructor = 1', {})).toBe(false)
    expect(holds('toString:*', {})).toBe(false)
    expect(holds('__proto__.x = 1', {})).toBe(false)
  })
})

describe('has and presence', () => {
  it('arrays, maps, messages and values', () => {
    expect(holds('tags:x', { tags: ['x', 'y'] })).toBe(true)
    expect(holds('tags:"x*"', { tags: ['xy'] })).toBe(true)
    expect(holds('tags:z', { tags: ['x'] })).toBe(false)
    expect(holds('labels:env', { labels: { env: 'p' } })).toBe(true)
    expect(holds('labels:env', { labels: new Map([['env', 'p']]) })).toBe(true)
    expect(holds('labels.env:prod', { labels: { env: 'prod' } })).toBe(true)
    expect(holds('id:5', { id: 5 })).toBe(true)
  })

  it('presence', () => {
    expect(holds('a:*', { a: 0 })).toBe(true)
    expect(holds('a:*', { a: '' })).toBe(true)
    expect(holds('a:*', { a: null })).toBe(false)
    expect(holds('a:*', {})).toBe(false)
  })
})

describe('logic and globals', () => {
  it('AND, OR, NOT, sequences', () => {
    expect(holds('a = 1 AND b = 2 OR c = 3', { a: 1, c: 3 })).toBe(true)
    expect(holds('a = 1 b = 2', { a: 1, b: 2 })).toBe(true)
    expect(holds('NOT (a = 1 OR b = 2)', { a: 3, b: 3 })).toBe(true)
  })

  it('global restrictions search every string and number, case-insensitively', () => {
    expect(holds('victor', { a: { b: ['Victor Hugo'] } })).toBe(true)
    expect(holds('"hugo" 1862', { a: 'Hugo', year: 1862 })).toBe(true)
    expect(holds('nobody', { a: 'Hugo' })).toBe(false)
    expect(holds('x', { a: new Date('2020-01-01') })).toBe(false)
  })

  it('a custom search handler replaces the default', () => {
    const search = (text: string, record: unknown) => (record as { title: string }).title.startsWith(text)
    expect(evaluateFilter(parse('Vic'), { title: 'Victor' }, { search })).toBe(true)
    expect(evaluateFilter(parse('tor'), { title: 'Victor' }, { search })).toBe(false)
  })
})

describe('functions', () => {
  it('run registered implementations', () => {
    expect(holds('regex(title, "^a")', { title: 'abc' })).toBe(true)
    expect(holds('regex(title, "^a")', { title: 'xbc' })).toBe(false)
    expect(holds('in(status, "paid", "sent")', { status: 'sent' })).toBe(true)
    expect(holds('length(title) > 2', { title: 'abc' })).toBe(true)
    expect(holds('createdAt < now()', { createdAt: '2020-01-01T00:00:00Z' })).toBe(true)
  })

  it('field parameters receive every value at the path', () => {
    expect(holds('regex(items.sku, "^B")', { items: [{ sku: 'A1' }, { sku: 'B2' }] })).toBe(true)
    expect(checkedHolds('regex(tags, "^b$")', { tags: ['a', 'b'] })).toBe(true)
  })

  it('fail fast when a function has no implementation', () => {
    expect(() => evaluateFilter(parse('mystery(1)'), {}, {})).toThrow('no evaluate implementation')
  })

  it('arithmetic on timestamps and durations', () => {
    expect(holds('createdAt > now() - 30d', { createdAt: '2024-05-20T00:00:00Z' })).toBe(true)
    expect(holds('createdAt > now() - 30d', { createdAt: '2024-04-01T00:00:00Z' })).toBe(false)
    expect(holds('ttl = 30s + 30s', { ttl: 60 })).toBe(true)
    expect(holds('n = 1 + 2', { n: 3 })).toBe(true)
  })
})
