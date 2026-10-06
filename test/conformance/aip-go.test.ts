// Cases ported from github.com/einride/aip-go (MIT), filtering/parser_test.go and
// filtering/unescape_test.go. Their expressions are translated into our s-expression notation;
// see CONFORMANCE.md for the license and the deliberate differences.
import { describe, expect, it } from 'vitest'
import { errorsOf, tree } from '../support/helpers'

describe('aip-go parser_test.go', () => {
  it.each([
    ['New York Giants', '(sequence New York Giants)'],
    ['New York Giants OR Yankees', '(sequence New York (or Giants Yankees))'],
    ['New York (Giants OR Yankees)', '(sequence New York (or Giants Yankees))'],
    ['a b AND c AND d', '(and (sequence a b) c d)'],
    ['(a b) AND c AND d', '(and (sequence a b) c d)'],
    ['a < 10 OR a >= 100', '(or (< a 10) (>= a 100))'],
    ['a OR b OR c', '(or a b c)'],
    ['NOT (a OR b)', '(not (or a b))'],
    ['-file:".java"', '(not (: file ".java"))'],
    ['-30', '-30'],
    ['package=com.google', '(= package com.google)'],
    ["msg != 'hello'", '(!= msg "hello")'],
    ['msg != "hello"', '(!= msg "hello")'],
    ['msg != ""', '(!= msg "")'],
    ['1 > 0', '(> 1 0)'],
    ['2.5 >= 2.4', '(>= 2.5 2.4)'],
    ['foo >= -2.4', '(>= foo -2.4)'],
    ['foo >= (-2.4)', '(>= foo -2.4)'],
    ['-2.5 >= -2.4', '(not (>= 2.5 -2.4))'],
    ['yesterday < request.time', '(< yesterday request.time)'],
    ['experiment.rollout <= cohort(request.user)', '(<= experiment.rollout (call cohort request.user))'],
    ['prod', 'prod'],
    ['expr.type_map.1.type', 'expr.type_map.1.type'],
    ["regex(m.key, '^.*prod.*$')", '(call regex m.key "^.*prod.*$")'],
    ["math.mem('30mb')", '(call math.mem "30mb")'],
    ["(msg.endsWith('world') AND retries < 10)", '(and (call msg.endsWith "world") (< retries 10))'],
    ["(endsWith(msg, 'world') AND retries < 10)", '(and (call endsWith msg "world") (< retries 10))'],
    ['time.now()', '(call time.now)'],
    ['timestamp("2012-04-21T11:30:00-04:00")', '(call timestamp "2012-04-21T11:30:00-04:00")'],
    ['duration("32s")', '(call duration "32s")'],
    ['duration("4h0m0s")', '(call duration "4h0m0s")'],
    [
      `
        start_time > timestamp("2006-01-02T15:04:05+07:00") AND
        (driver = "driver1" OR start_driver = "driver1" OR end_driver = "driver1")
      `,
      '(and (> start_time (call timestamp "2006-01-02T15:04:05+07:00")) (or (= driver "driver1") (= start_driver "driver1") (= end_driver "driver1")))',
    ],
    ['annotations:schedule', '(: annotations schedule)'],
    ['annotations.schedule = "test"', '(= annotations.schedule "test")'],
    ['foo = 0xdeadbeef', '(= foo 0xdeadbeef)'],
    ['object_id = "�g/ml" OR object_id = "µg/ml"', '(or (= object_id "�g/ml") (= object_id "µg/ml"))'],
  ])('parses %j', (source, expected) => {
    expect(tree(source)).toBe(expected)
  })

  it('rejects the inputs aip-go rejects', () => {
    expect(errorsOf('<')[0]).toMatchObject({ code: 'unexpected-token', message: 'Unexpected "<"' })
    expect(errorsOf('(-2.5) >= -2.4')[0]).toMatchObject({ code: 'unexpected-token', message: 'Unexpected ">="' })
    expect(errorsOf('a = "foo')[0]).toMatchObject({ code: 'unterminated-string' })
    expect(errorsOf('invalid = foo\ud800bar')[0]).toMatchObject({ code: 'invalid-unicode' })
  })
})

describe('aip-go unescape_test.go', () => {
  const value = (literal: string) => tree(`msg != ${literal}`)

  it.each([
    [`'hello'`, 'hello'],
    [`""`, ''],
    [String.raw`"\\\""`, '\\"'],
    [String.raw`"\\"`, '\\'],
    [String.raw`"\303\277"`, 'Ã¿'],
    [String.raw`"\377"`, 'ÿ'],
    [String.raw`"☺☺"`, '☺☺'],
    [String.raw`"\a\b\f\n\r\t\v\'\"\\\? Legal escapes"`, "\x07\b\f\n\r\t\v'\"\\? Legal escapes"],
    [`"[ 'hello' ]"`, "[ 'hello' ]"],
    [String.raw`"[ \'hello\' ]"`, "[ 'hello' ]"],
    [String.raw`"[ \"hello\" ]"`, '[ "hello" ]'],
  ])('unescapes %s', (literal, decoded) => {
    expect(value(literal)).toBe(`(!= msg ${JSON.stringify(decoded)})`)
  })

  it.each([
    String.raw`"\a\b\f\n\r\t\v\'\"\\\? Illegal escape \>"`,
    String.raw`"\u00f"`,
    String.raw`"\u00fÿ"`,
    String.raw`"\26"`,
    String.raw`"\268"`,
    String.raw`"\267\"`,
    `'`,
  ])('rejects %s', (literal) => {
    expect(errorsOf(`msg != ${literal}`).length).toBeGreaterThan(0)
  })
})
