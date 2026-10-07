import { describe, expect, it } from 'vitest'
import { errorsOf as parseErrors, parse } from '../../../test/support/helpers'
import { schema } from '../../../test/support/schema'
import type { Schema } from '../schema'
import { checkFilter } from './check'

const options = { extensions: { arithmetic: true, durationUnits: true } }
const run = (source: string) => checkFilter(parse(source, options), schema)
const accepts = (source: string) => expect(run(source), source).toMatchObject({ ok: true })
const errorsOf = (source: string) => {
  const result = run(source)
  if (result.ok) throw new Error(`expected errors: ${source}`)
  return result.errors
}
const rejects = (source: string, code: string) => expect(errorsOf(source)[0], source).toMatchObject({ code })

describe('fields', () => {
  it('resolves members and canonicalises aliases', () => {
    const result = run('headline = "x"')
    expect(result).toMatchObject({ ok: true, ast: { left: { path: ['title'], field: { name: 'title', spec: { type: 'string' } } } } })
  })

  it('suggests close names for unknown fields', () => {
    const [error] = errorsOf('stauts = paid')
    expect(error).toMatchObject({ code: 'unknown-field', span: { start: 0, end: 6 } })
    expect(error!.hint).toBe('Did you mean "status"?')
    expect(errorsOf('zzzzzzzzzz = 1')[0]!.hint).toContain('Available fields')
    rejects('constructor = 1', 'unknown-field')
    rejects('__proto__ = 1', 'unknown-field')
  })

  it('rejects fields that are not filterable', () => {
    rejects('notes = "x"', 'not-filterable')
    rejects('author.secret = "x"', 'not-filterable')
  })

  it('rejects subfields of a message that is not filterable', () => {
    const hidden: Schema = { fields: { outer: { type: 'message', fields: { hidden: { type: 'message', filterable: false, fields: { x: { type: 'string' } } } } } } }
    expect(checkFilter(parse('outer.hidden.x = "a"'), hidden)).toMatchObject({ ok: false, errors: [{ code: 'not-filterable' }] })
  })

  it('traverses messages, maps and any', () => {
    accepts('author.name = "ann"')
    accepts('author.age >= 18')
    accepts('items.sku = "A1"')
    accepts('labels.env = "prod"')
    accepts('meta.deep.path = 1')
    rejects('author.nope = 1', 'invalid-traversal')
    rejects('title.x = 1', 'invalid-traversal')
    expect(errorsOf('author.nope = 1')[0]!.hint).toContain('name')
  })

  it('collects errors from every branch', () => {
    expect(errorsOf('nope = 1 AND notes = "x" OR status = "bad"').map((e) => e.code)).toEqual(['unknown-field', 'not-filterable', 'invalid-value'])
  })
})

describe('values', () => {
  it('string', () => {
    accepts('title = "x"')
    accepts('title = x')
    rejects('title = 5', 'invalid-value')
    rejects('title = true', 'invalid-value')
  })

  it('integer and number accept numbers and numeric strings', () => {
    accepts('id = 5')
    accepts('id = "5"')
    accepts('id >= -5')
    accepts('id = 0xff')
    accepts('price > 2.5e3')
    rejects('id = 1.5', 'invalid-value')
    rejects('id = "abc"', 'invalid-value')
    rejects('price = true', 'invalid-value')
  })

  it('boolean', () => {
    accepts('active = true')
    accepts('active = "false"')
    rejects('active = 1', 'invalid-value')
  })

  it('enum', () => {
    accepts('status = paid')
    const [error] = errorsOf('status = "gone"')
    expect(error!.hint).toBe('Allowed values: draft, paid, sent')
  })

  it('timestamp and duration, quoted or not', () => {
    accepts('createdAt > 2012-04-21T11:30:00-04:00')
    accepts('createdAt > "2012-04-21T11:30:00Z"')
    accepts('ttl <= 20s')
    accepts('ttl = "30s"')
    rejects('createdAt > "yesterday"', 'invalid-value')
    rejects('createdAt > 5', 'invalid-value')
    rejects('ttl > 5', 'invalid-value')
  })
})

describe('operators', () => {
  it('ordering needs an ordered type', () => {
    accepts('price <= 5')
    accepts('title < "m"')
    rejects('status > paid', 'operator-not-allowed')
    rejects('active < true', 'operator-not-allowed')
    expect(errorsOf('status > paid')[0]!.hint).toBe('Supported: = !=')
  })

  it('repeated fields, maps and messages need :', () => {
    rejects('tags = "x"', 'operator-not-allowed')
    rejects('labels = "x"', 'operator-not-allowed')
    rejects('author = "x"', 'operator-not-allowed')
    accepts('tags:x')
    accepts('labels:env')
    accepts('author:name')
    accepts('items.sku:A1')
  })

  it('has works on single values too, and presence on everything', () => {
    accepts('labels.env:"prod"')
    accepts('id:1')
    rejects('id:"x"', 'invalid-value')
    accepts('tags:*')
    accepts('author:*')
    accepts('createdAt:*')
  })

  it('wildcards only on strings', () => {
    accepts('title = "*.foo"')
    accepts('title != "a*b*"')
    rejects('status = "pa*"', 'wildcard-not-allowed')
    rejects('id = "1*"', 'wildcard-not-allowed')
    accepts('tags:"x*"')
  })
})

describe('functions', () => {
  it('validates names, arity and argument kinds', () => {
    accepts('regex(title, "^a")')
    accepts('in(status, "paid", "sent")')
    accepts('in(status)')
    rejects('regxe(title, "x")', 'unknown-function')
    expect(errorsOf('regxe(title, "x")')[0]!.hint).toBe('Did you mean "regex"?')
    rejects('regex(title)', 'wrong-arity')
    rejects('regex(title, "a", "b")', 'wrong-arity')
    rejects('in()', 'wrong-arity')
    rejects('regex("title", "x")', 'wrong-argument')
    rejects('regex(id, "x")', 'wrong-argument')
    rejects('regex(nope, "x")', 'unknown-field')
    rejects('regex(title, 5)', 'wrong-argument')
  })

  it('a function used as a condition must return boolean', () => {
    rejects('now()', 'not-boolean')
    rejects('length(title)', 'not-boolean')
  })

  it('compares function results by type', () => {
    accepts('length(title) > 3')
    accepts('createdAt < now()')
    rejects('length(title) > "x"', 'invalid-value')
    rejects('title < now()', 'invalid-value')
  })

  it('arithmetic types', () => {
    accepts('createdAt > now() - 30d')
    accepts('createdAt > now() - 1d + 2h')
    accepts('ttl < 1h + 20s')
    accepts('price > 1 + 2.5')
    rejects('createdAt > 30d - now()', 'invalid-value')
    rejects('id > now() - 30d', 'invalid-value')
  })

  it('unregistered schemas reject every call', () => {
    expect(checkFilter(parse('f(1)'), { fields: {} })).toMatchObject({ ok: false, errors: [{ code: 'unknown-function' }] })
  })

  it('globals are always valid', () => {
    accepts('hello "two words" -world')
  })
})

describe('syntax errors are separate from check errors', () => {
  it('parser accepts what the checker rejects', () => {
    expect(parseErrors('title = ')[0]).toMatchObject({ code: 'unexpected-token' })
    accepts('title = x')
  })
})
