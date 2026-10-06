import { describe, expect, it } from 'vitest'
import { parse, stripSpans, tree } from '../../../test/support/helpers'
import type { Arg, Expr, Operand } from '../ast'
import type { ParseOptions } from '../options'
import { parseFilter } from '../parser/parse'
import { printFilter } from './print'
import { quote } from './quote'

const print = (source: string, options?: ParseOptions) => printFilter(parse(source, options))

describe('printer', () => {
  it('quotes strings with escapes', () => {
    expect(quote('a"b\\c\nd\u0001\u007f')).toBe('"a\\"b\\\\c\\nd\\u0001\\u007f"')
    expect(print("title = 'it\\'s'")).toBe('title = "it\'s"')
    expect(() => quote('\ud800')).toThrow('unpaired')
  })

  it('uses keywords, never minus, for negation', () => {
    expect(print('-a = 1')).toBe('NOT a = 1')
    expect(print('-5')).toBe('-5')
    expect(print('-5 b')).toBe('-5 b')
    expect(print('NOT -5')).toBe('NOT -5')
  })

  it('parenthesises OR groups inside AND, and other nested groups', () => {
    expect(print('a AND b OR c')).toBe('a AND (b OR c)')
    expect(print('a b OR c')).toBe('a (b OR c)')
    expect(print('(a AND b) OR c')).toBe('(a AND b) OR c')
    expect(print('a OR (b c)')).toBe('a OR (b c)')
    expect(print('NOT (a OR b)')).toBe('NOT (a OR b)')
    expect(print('NOT (NOT a)')).toBe('NOT (NOT a)')
    expect(print('(a AND b) AND c')).toBe('(a AND b) AND c')
    expect(print('a b AND c')).toBe('a b AND c')
  })

  it('prints calls, presence, has and arithmetic', () => {
    expect(print('f(a,(b OR c),"x")')).toBe('f(a, (b OR c), "x")')
    expect(print('m.foo:*')).toBe('m.foo:*')
    expect(print('r:42')).toBe('r:42')
    expect(print('a > now() - 1d - 2h', { extensions: { arithmetic: true, durationUnits: true } })).toBe('a > now() - 1d - 2h')
  })

  it('refuses text that cannot be read back', () => {
    const at = { start: 0, end: 0 }
    const negative: Expr = {
      kind: 'compare',
      op: '=',
      left: { kind: 'number', value: -5, raw: '-5', span: at },
      right: { kind: 'member', path: ['x'], span: at },
      span: at,
    }
    expect(() => printFilter(negative)).toThrow('negative number')
  })

  it.each([
    'a = 1',
    'a = 1 b = 2 OR c = 3',
    'a = 1 AND b = 2 OR c = 3 AND d = 4',
    '-a = 1 -b:* NOT (c = 1 OR d = 2)',
    'x y z',
    'title = "*.foo" AND createdAt > 2012-04-21T11:30:00Z',
    "title = 'it\\'s' OR title = \"say \\\"hi\\\"\"",
    'in(status, paid, "sent") AND (similar(title, "x") OR regex(title, "^a"))',
    '((a))',
    'a = 1e3 AND b >= -2.50 AND c < 1.50s',
    'meta:42 AND meta:"x" AND meta:*',
    '(a AND b) AND c',
    'a = 1.0 AND d = 1.50s',
    'New York (Giants OR Yankees)',
    '-30 -2.5 >= -2.4',
    'a.1.b = 0xff',
    'f (a)',
    'name = "日本語 ✓ \\u0001"',
  ])('print(parse(s)) is stable: %s', (source) => {
    const once = print(source)
    expect(print(once)).toBe(once)
    expect(stripSpans(parse(once))).toEqual(stripSpans(parse(source)))
  })

  it('canonical text keeps the tree', () => {
    expect(tree(print('a b AND c OR d'))).toBe(tree('a b AND c OR d'))
  })
})

// Seeded generator so failures are reproducible.
const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296

const span = { start: 0, end: 0 }
const heads = ['a', 'b_c', 'x1', '名前', 'status', 'createdAt']
const segments = [...heads, '1', '42']
const strings = ['', 'plain', 'with "quotes"', "it's", 'back\\slash', 'line\nbreak', 'tab\t', '*.foo', "'; DROP TABLE x; --", 'ünï ✓ 😀', '\u0001\u007f', '(a OR b)', 'AND', '-5']
const numbers = ['0', '1', '42', '-7', '1.5', '-0.25', '2.997e9', '1e-3', '0xff', '9007199254740993']
const names = ['f', 'math.mem', 'a.b.c', 'isNull']

const generate = (random: () => number, extended: boolean) => {
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)]!
  const member = (): Operand => ({
    kind: 'member',
    path: [pick(heads), ...Array.from({ length: Math.floor(random() * 3) }, () => pick(segments))].slice(0, 1 + Math.floor(random() * 3)),
    span,
  })
  const literal = (allowNegative: boolean): Operand => {
    switch (Math.floor(random() * 5)) {
      case 0:
        return { kind: 'string', value: pick(strings), span }
      case 1: {
        const raw = pick(numbers.filter((n) => allowNegative || !n.startsWith('-')))
        return { kind: 'number', value: Number(raw), raw, span }
      }
      case 2:
        return { kind: 'boolean', value: random() < 0.5, span }
      case 3:
        return { kind: 'duration', amount: pick([1, 30, 1.5, 0.25]), unit: extended ? pick(['s', 'm', 'h', 'd', 'w'] as const) : 's', span }
      default:
        return { kind: 'timestamp', value: pick(['2012-04-21T11:30:00-04:00', '2012-04-21T11:30:00Z', '2012-04-21T11:30:00.25+02:00']), span }
    }
  }
  const operand = (depth: number, allowNegative: boolean, allowBinary: boolean): Operand => {
    const roll = random()
    if (allowBinary && extended && depth > 0 && roll < 0.2) {
      return { kind: 'binary', op: pick(['+', '-'] as const), left: operand(depth - 1, true, true), right: operand(depth - 1, true, false), span }
    }
    if (depth > 0 && roll < 0.4) return call(depth - 1)
    return roll < 0.7 ? member() : literal(allowNegative)
  }
  const call = (depth: number): Operand => ({
    kind: 'call',
    name: pick(names),
    args: Array.from({ length: Math.floor(random() * 3) }, (): Arg => {
      const arg = depth > 0 && random() < 0.25 ? group(depth - 1) : operand(depth, true, true)
      return arg.kind === 'global' ? arg.value : arg
    }),
    span,
  })
  const restriction = (depth: number): Expr => {
    const left = (): Operand => {
      const value = random() < 0.7 ? member() : literal(false)
      return value.kind === 'member' || random() < 0.5 ? value : call(depth)
    }
    switch (Math.floor(random() * 6)) {
      case 0:
      case 1:
        return { kind: 'compare', op: pick(['=', '!=', '<', '<=', '>', '>='] as const), left: left(), right: operand(depth, true, true), span }
      case 2:
        return { kind: 'has', left: left(), right: operand(depth, true, true), span }
      case 3:
        return { kind: 'present', left: left(), span }
      case 4:
        return { kind: 'global', value: operand(0, !extended, false) as Operand & { kind: Exclude<Operand['kind'], 'call' | 'binary'> }, span }
      default:
        return call(depth) as Expr
    }
  }
  const group = (depth: number): Expr => {
    if (depth <= 0) return restriction(0)
    const roll = Math.floor(random() * 8)
    const args = () => Array.from({ length: 2 + Math.floor(random() * 2) }, () => group(depth - 1))
    switch (roll) {
      case 0:
        return { kind: 'and', args: args(), span }
      case 1:
        return { kind: 'or', args: args(), span }
      case 2:
        return { kind: 'sequence', args: args(), span }
      case 3:
        return { kind: 'not', arg: group(depth - 1), span }
      default:
        return restriction(depth)
    }
  }
  return group(4)
}

describe('printer property', () => {
  for (const extended of [false, true]) {
    const options: ParseOptions = extended ? { extensions: { arithmetic: true, durationUnits: true } } : {}

    it(`parse(print(ast)) equals ast for random ASTs (extensions ${extended})`, () => {
      const random = rng(extended ? 99 : 1234)
      for (let i = 0; i < 1500; i++) {
        const ast = generate(random, extended)
        const printed = printFilter(ast)
        const reparsed = parseFilter(printed, options)
        expect(reparsed.ok, printed).toBe(true)
        expect(stripSpans(reparsed.ast), printed).toEqual(stripSpans(ast))
        expect(printFilter(reparsed.ast!), printed).toBe(printed)
      }
    })
  }
})
