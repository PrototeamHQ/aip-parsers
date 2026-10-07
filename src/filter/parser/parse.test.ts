import { describe, expect, it } from 'vitest'
import { errorsOf, parse, tree } from '../../../test/support/helpers'
import { lineColumn } from '../../shared/span'
import { FilterSyntaxError } from '../errors'
import { parseFilter, parseFilterOrThrow } from './parse'

describe('grammar', () => {
  it('parses every comparator', () => {
    for (const op of ['=', '!=', '<', '<=', '>', '>=']) expect(tree(`a ${op} 1`)).toBe(`(${op} a 1)`)
  })

  it('precedence: OR > implicit AND > explicit AND', () => {
    expect(tree('a AND b OR c')).toBe('(and a (or b c))')
    expect(tree('a b OR c')).toBe('(sequence a (or b c))')
    expect(tree('a b AND c d')).toBe('(and (sequence a b) (sequence c d))')
    expect(tree('a OR b AND c OR d')).toBe('(and (or a b) (or c d))')
  })

  it('parentheses override precedence and stay as written', () => {
    expect(tree('(a AND b) OR c')).toBe('(or (and a b) c)')
    expect(tree('(a AND b) AND c')).toBe('(and (and a b) c)')
    expect(tree('((a))')).toBe('a')
  })

  it('NOT and minus; stacking needs parentheses', () => {
    expect(tree('NOT a = 1')).toBe(tree('-a = 1'))
    expect(tree('a OR NOT b')).toBe('(or a (not b))')
    expect(tree('NOT (NOT a)')).toBe('(not (not a))')
    expect(errorsOf('NOT NOT a')[0]).toMatchObject({ code: 'unexpected-token' })
    expect(tree('NOT -5')).toBe('(not -5)')
  })

  it('keywords are case sensitive', () => {
    expect(tree('a and b')).toBe('(sequence a and b)')
    expect(tree('ANDROID')).toBe('ANDROID')
  })

  it('traversal accepts numbers and keywords as field names', () => {
    expect(tree('a.1.b = 1')).toBe('(= a.1.b 1)')
    expect(tree('a.AND = 1')).toBe('(= a.AND 1)')
  })

  it('functions: dotted names, nesting, groups as arguments', () => {
    expect(tree('f(g(1), (a OR b), x.y)')).toBe('(call f (call g 1) (or a b) x.y)')
    expect(tree('a.b.c(1) > 2')).toBe('(> (call a.b.c 1) 2)')
    expect(tree('f ( a )')).toBe('(sequence f a)')
  })

  it('text is permissive', () => {
    expect(tree('foo@bar_baz 3rd 30d *.log')).toBe('(sequence foo@bar_baz 3rd 30d * log)'.replace('* log', '*.log'))
    expect(tree('éclair 日本')).toBe('(sequence éclair 日本)')
  })

  it('empty input has no filter', () => {
    expect(parseFilter('')).toEqual({ ok: true, ast: undefined, errors: [] })
    expect(parseFilter(' \n\t ')).toEqual({ ok: true, ast: undefined, errors: [] })
  })
})

describe('literals', () => {
  it('booleans, durations, timestamps, negative numbers', () => {
    expect(tree('a = true AND b = false')).toBe('(and (= a true) (= b false))')
    expect(tree('a = 20s')).toBe('(= a 20s)')
    expect(tree('a = 1.5s')).toBe('(= a 1.5s)')
    expect(tree('a = 2012-04-21T11:30:00.5Z')).toBe('(= a 2012-04-21T11:30:00.5Z)')
    expect(tree('a >= -5')).toBe('(>= a -5)')
    expect(tree('a = 1e-3')).toBe('(= a 1e-3)')
    expect(tree('a = 9007199254740993')).toBe('(= a 9007199254740993)')
  })

  it('negative hex numbers keep their value', () => {
    expect(parse('a = -0x10')).toMatchObject({ right: { kind: 'number', value: -16, raw: '-0x10' } })
  })

  it('true and false are only literals on their own', () => {
    expect(tree('a = true.x')).toBe('(= a true.x)')
  })

  it('without extensions other durations are plain text', () => {
    expect(tree('a = 30d')).toBe('(= a 30d)')
  })
})

describe('extensions', () => {
  const options = { extensions: { arithmetic: true, durationUnits: true } }

  it('duration units', () => {
    expect(tree('a = 30d', options)).toBe('(= a 30d)')
    expect(tree('a = 2w AND b = 5m AND c = 1.5h', options)).toBe('(and (= a 2w) (= b 5m) (= c 1.5h))')
  })

  it('arithmetic', () => {
    expect(tree('a > now() - 30d', options)).toBe('(> a (- (call now) 30d))')
    expect(tree('a > now()+1h', options)).toBe('(> a (+ (call now) 1h))')
    expect(tree('a > 1 - 2 - 3', options)).toBe('(> a (- (- 1 2) 3))')
    expect(tree('a > f(now() - 1d)', options)).toBe('(> a (call f (- (call now) 1d)))')
    expect(tree('a > 5 -b', options)).toBe('(> a (- 5 b))')
  })

  it('now-offset allows only now() +/- duration', () => {
    const only = { extensions: { arithmetic: 'now-offset' as const, durationUnits: true } }
    expect(tree('a > now() - 30d', only)).toBe('(> a (- (call now) 30d))')
    expect(tree('a > now()+1h', only)).toBe('(> a (+ (call now) 1h))')
    expect(tree('a > now() + 1h', only)).toBe('(> a (+ (call now) 1h))')
    expect(tree('a = 1 -b', only)).toBe('(sequence (= a 1) (not b))')
    expect(tree('a > now() -30d', only)).toBe('(> a (- (call now) 30d))')
    for (const source of ['a > now() - 30', 'a > now() - x', 'a > now() -b', 'a > now() - "30d"', 'a > now() + x', 'a > now() -', 'a > now() - (30d)']) {
      const [error] = errorsOf(source, only)
      expect(error, source).toMatchObject({ code: 'expected-token' })
      expect(error!.hint).toBe('Durations need a unit, for example now() - 30d')
    }
    expect(tree('c++ = x+y', only)).toBe('(= c++ x+y)')
  })

  it('is off by default', () => {
    expect(tree('a > 5 -b')).toBe('(sequence (> a 5) (not b))')
  })
})

describe('errors', () => {
  it('report spans and hints', () => {
    const [error] = errorsOf('a = 1 AND b = !')
    expect(error).toMatchObject({ code: 'unexpected-character', span: { start: 14, end: 15 } })
    expect(error!.hint).toBeTruthy()
    expect(lineColumn('a = 1\nb = !', 10)).toEqual({ line: 2, column: 5 })
  })

  it('lexical errors', () => {
    expect(errorsOf('a = "abc')[0]).toMatchObject({ code: 'unterminated-string', span: { start: 4, end: 8 } })
    expect(errorsOf(String.raw`a = "x\q"`)[0]).toMatchObject({ code: 'invalid-escape', span: { start: 6, end: 8 } })
    expect(errorsOf('a > 2012-04-21')[0]).toMatchObject({ code: 'invalid-timestamp' })
    expect(errorsOf('a > 2012-04-21')[0]!.hint).toContain('quote')
    expect(errorsOf('a > 2012-02-30T00:00:00Z')[0]).toMatchObject({ code: 'invalid-timestamp' })
    expect(errorsOf('a = x\ud800')[0]).toMatchObject({ code: 'invalid-unicode' })
  })

  it('syntax errors', () => {
    expect(errorsOf('a =')[0]).toMatchObject({ code: 'unexpected-token', span: { start: 3, end: 3 } })
    expect(errorsOf('a.')[0]).toMatchObject({ code: 'expected-token' })
    expect(errorsOf('a = (b AND c)')[0]).toMatchObject({ code: 'unexpected-token' })
    expect(errorsOf('(a')[0]).toMatchObject({ code: 'expected-token', span: { start: 0, end: 1 } })
    expect(errorsOf('a)')[0]).toMatchObject({ code: 'unexpected-token', span: { start: 1, end: 2 } })
    expect(errorsOf('f(a,)')[0]).toMatchObject({ code: 'unexpected-token' })
    expect(errorsOf('f(a')[0]).toMatchObject({ code: 'expected-token' })
    expect(errorsOf('a = -x')[0]).toMatchObject({ code: 'unexpected-token' })
    expect(errorsOf('()')[0]).toMatchObject({ code: 'unexpected-token' })
  })

  it('tolerant: collects every error and keeps a best-effort tree', () => {
    const result = parseFilter('a = $ AND b = 2 AND c = "x OR d = 1')
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
    expect(result.ast).toBeDefined()
    expect(result.errors.map((e) => e.span.start)).toEqual([...result.errors.map((e) => e.span.start)].sort((a, b) => a - b))
  })

  it('tolerant: unclosed groups still yield their content', () => {
    const result = parseFilter('(a = 1 AND b = 2')
    expect(result.ok).toBe(false)
    expect(result.ast).toMatchObject({ kind: 'and' })
  })

  it('throws on request', () => {
    expect(() => parseFilterOrThrow('a =')).toThrow(FilterSyntaxError)
    expect(parseFilterOrThrow('')).toBeUndefined()
  })

  it('spans cover each node', () => {
    const node = parse('title = "x" AND NOT a:1')
    expect(node.span).toEqual({ start: 0, end: 23 })
    expect(node.kind === 'and' && node.args.map((a) => a.span)).toEqual([
      { start: 0, end: 11 },
      { start: 16, end: 23 },
    ])
  })
})

describe('hostile input', () => {
  it('injection-looking strings are just strings', () => {
    for (const evil of ["'; DROP TABLE x; --", "x' OR '1'='1", '" OR 1=1 --', '${process.exit()}', '<script>alert(1)</script>']) {
      const quoted = JSON.stringify(evil)
      expect(tree(`title = ${quoted}`)).toBe(`(= title ${quoted})`)
      expect(tree(quoted)).toBe(quoted)
    }
    expect(tree(`title = "'; DROP TABLE x; --"`)).toBe(`(= title "'; DROP TABLE x; --")`)
  })

  it('unquoted injection attempts do not parse as anything dangerous', () => {
    const result = parseFilter("title = x'; DROP TABLE x; --")
    expect(result.ok).toBe(false)
  })

  it('limits nesting depth for groups, negations and calls', () => {
    const groups = `${'('.repeat(200)}a${')'.repeat(200)}`
    expect(errorsOf(groups).some((e) => e.code === 'too-deep')).toBe(true)
    expect(errorsOf(`${'f('.repeat(200)}1${')'.repeat(200)}`).some((e) => e.code === 'too-deep')).toBe(true)
    expect(errorsOf(`${'NOT ('.repeat(200)}a${')'.repeat(200)}`).some((e) => e.code === 'too-deep')).toBe(true)
    expect(parseFilter(`${'('.repeat(30)}a${')'.repeat(30)}`).ok).toBe(true)
    expect(parseFilter(`${'('.repeat(30)}a${')'.repeat(30)}`, { maxDepth: 10 }).ok).toBe(false)
  })

  it('limits input length', () => {
    expect(errorsOf('a'.repeat(20_000))[0]).toMatchObject({ code: 'too-long' })
    expect(parseFilter('a'.repeat(20_000), { maxLength: 30_000 }).ok).toBe(true)
  })

  it('survives long flat inputs', () => {
    expect(parseFilter(Array.from({ length: 2000 }, (_, i) => `f${i} = ${i}`).join(' OR '), { maxLength: 100_000 }).ok).toBe(true)
  })

  it('handles unicode', () => {
    expect(tree('name = "日本語 ✓ 😀"')).toBe('(= name "日本語 ✓ 😀")')
    expect(tree('名前 = "x"')).toBe('(= 名前 "x")')
    expect(tree('a = "\\u263A \\U0001F600"')).toBe('(= a "☺ 😀")')
    expect(errorsOf('a = "\\ud800"')[0]).toMatchObject({ code: 'invalid-escape' })
    expect(errorsOf('a = "\\U00110000"')[0]).toMatchObject({ code: 'invalid-escape' })
  })

  it('never throws on arbitrary text', () => {
    const alphabet = ['a', ' ', '(', ')', '"', "'", '\\', '-', '.', ':', '=', '<', '!', ',', 'AND', 'OR', 'NOT', '1', '2e', '*', '\ud800']
    let seed = 7
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (let i = 0; i < 3000; i++) {
      const source = Array.from({ length: 1 + Math.floor(random() * 14) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')
      expect(() => parseFilter(source, { extensions: { arithmetic: true } })).not.toThrow()
    }
  })
})
