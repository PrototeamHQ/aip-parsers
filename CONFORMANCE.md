# Conformance

How this implementation is tested against the AIP-160 and AIP-132 texts and against einride's aip-go, and every place where the specification is ambiguous together with the decision taken here.

## Sources

| Suite | Cases | Where |
| --- | --- | --- |
| Every example in [AIP-160](https://google.aip.dev/160) (tree shape and meaning) | 28 | `test/conformance/aip-160.test.ts` |
| Ported from [einride/aip-go](https://github.com/einride/aip-go) `filtering/parser_test.go` and `filtering/unescape_test.go` | 55 | `test/conformance/aip-go.test.ts` |
| Every example in [AIP-132](https://google.aip.dev/132) `order_by` | 7 (spec examples, errors, checking) | `src/order-by/order-by.test.ts` |
| Grammar, literals, errors and spans, injection-looking strings, unicode, nesting and length limits | | `src/filter/parser/parse.test.ts` |
| Printer round trips and a seeded property test (3000 random ASTs) | | `src/filter/print/print.test.ts` |
| Checker and evaluator rules | | `src/filter/check`, `src/filter/evaluate` |

## Credit and license

The ported cases come from github.com/einride/aip-go, which is MIT licensed:

> Copyright 2020 Einride AB
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Only test inputs and the shape of the expected trees were taken, translated into this library's s-expression notation (`test/support/sexpr.ts`). No aip-go code is included.

Not ported: the lexer token tests (this lexer is shaped differently), the checker and CEL-based tests (aip-go builds on protobuf CEL expressions and declarations), and the macros `timestamp(...)` and `duration(...)`, which are parsed here as ordinary calls. The invalid-UTF-8 case is replaced by an unpaired-surrogate case, since JavaScript strings cannot hold invalid UTF-8.

## Deliberate differences from aip-go

- Booleans: `true` and `false` are boolean literals, not text.
- Hex numbers, floats and exponents are single tokens here; aip-go assembles floats in the parser.
- Unquoted RFC-3339 timestamps and (with extensions) durations beyond `s` are accepted.
- A call's `(` must touch the function name, so `York (a OR b)` is a term and a group, not a call.
- The tree distinguishes `sequence` (implicit AND) from `and`, as aip-go does, but members are `member` nodes with a path rather than nested field selections.

## Ambiguities and decisions

1. **Bare values.** The spec uses `a AND b` as if `a` and `b` were boolean fields, but its grammar makes a bare value a global restriction (a search term). Decision: a bare member is a `global` node. To test a boolean field write `a = true`.
2. **Implicit AND and precedence.** The prose says `OR` binds tighter than `AND`. The grammar has three levels: `OR` (factor), whitespace sequence, then `AND`. Decision: follow the grammar; `a b OR c` is `a (b OR c)`, and `a b AND c` is `(a b) AND c`. Evaluation treats a sequence as AND.
3. **Right-hand text.** `status = paid` and `package=com.google` have a bare right-hand side. aip-go keeps it as text/member (`Equals(Text("package"), Member(Text("com"), "google"))`). Decision: the same, as a `member` that means a text value, never a field reference. Field-to-field comparison is unsupported.
4. **Negation.** `-` and `NOT` are equivalent. The grammar allows only a restriction or group after them, so `NOT NOT a` is rejected (write `NOT (NOT a)`). Following aip-go, a lone `-5` is the number -5, while `-5 >= x` is the negation of a comparison. Because of that, a negative number cannot start a comparison when printing, and the printer throws instead.
5. **Keywords** `AND`, `OR`, `NOT` are case sensitive. After a dot they are valid field names; so are numbers (`a.1.b`).
6. **Text tokens.** Text is any run of characters other than whitespace, quotes and `( ) - . = : < > ! ,`. A digit-led run that is not a number, duration or timestamp (`3rd`, `30d`) is text.
7. **Durations.** The spec defines only the `s` suffix. Decision: `s` by default; `m h d w` behind the `durationUnits` extension. Quoted duration text such as `"1.5m"` is accepted when checking and evaluating.
8. **Timestamps.** The spec says "an RFC-3339 formatted string". Decision: quoted strings are converted by field type; bare timestamps are also accepted as literals. A bare date (`2012-04-21`) is an error with a hint to quote it. Seconds of 60 and out-of-range dates are rejected. Evaluation has millisecond precision.
9. **Wildcards.** Only `*` is specified, and only with `=`/`!=`. Decision: any `*` in a string used with those operators is a wildcard matching the whole value; neither the spec nor aip-go defines an escape (aip-go's unescape rejects `\*` as an illegal escape, and its filtering package has no wildcard handling at all), so there is no way to write a literal `*` and `\*` is an invalid escape here too; use `regex()` or a registered function for that. Wildcards are rejected on non-string fields. `field:*` is presence only when `*` is the entire right-hand side.
10. **Has operator.** `r:42` matches an array element, `m:foo` a map or message key, and `m.foo:42` equality on the value, as in the spec examples. Decision: on a plain string field `:` is equality (with wildcards), not substring; use `name:"*foo*"` for contains. Presence (`:*`) means not null and not undefined; an empty array or string is present.
11. **Missing values.** The spec is silent. Decision: comparisons against a missing or null value are false, `!=` is the negation of `=` (so it is true), and `NOT (a = 1)` is true.
12. **Repeated fields.** A path through arrays matches when any element matches. `=` on a repeated field is rejected by the checker (use `:`); the evaluator accepts it element-wise.
13. **Type conversion.** The spec says strings convert to the field type. Decision: a checked AST converts by field type; an unchecked one infers from the record value (a quoted string compared with a number converts when numeric, with a `Date` converts when it is a timestamp, and so on). Two strings compare as strings.
14. **Numbers.** Integers beyond 2^53 and decimals keep their text in `raw` and compare exactly as decimals; exponent and hex forms compare as doubles.
15. **Functions.** The spec lets APIs define any `call(arg...)`. Decision: the parser accepts any call, with dotted names and arguments that are values or parenthesised groups; the registry gives meaning. A call alone is a condition; a call on either side of a comparator is a value. No functions are built in.
16. **Composites.** A group on the left of a comparator is an error, as in aip-go (`(-2.5) >= -2.4`). A group on the right that holds a single value is that value (`foo >= (-2.4)`).
17. **Global restriction semantics** are service-defined. Decision: the evaluator takes a `search` callback and defaults to a case-insensitive substring search over every string and number in the record.
18. **Strings.** Single or double quotes with the CEL escapes used by aip-go: `\a \b \f \n \r \t \v \' \" \\ \? \` \xHH \uXXXX \UXXXXXXXX` and three-digit octal. Escapes naming surrogates or values above U+10FFFF are errors.
19. **order_by.** AIP-132 defines only the `desc` suffix. Decision: `asc` is accepted too and printed without a suffix; `desc` and `asc` are lowercase only.

## Safety limits

- Nesting (groups, negations, calls) is limited to 64 levels by default (`maxDepth`) and input to 10,000 UTF-16 units (`maxLength`); both are options.
- Strings are data: nothing is ever interpolated or executed. `'; DROP TABLE x; --` is a string like any other, and unquoted attempts are syntax errors.
- Wildcard matching is a linear scan, and no user text is compiled into a regular expression by the library.
- Unpaired surrogates are rejected with `invalid-unicode`.
- Prototype keys (`constructor`, `__proto__`) are never resolved as fields or record paths.
