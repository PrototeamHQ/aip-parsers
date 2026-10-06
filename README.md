# aip-parsers

Parser, checker, printer and evaluator for [AIP-160](https://google.aip.dev/160) filters, plus a parser for [AIP-132](https://google.aip.dev/132) `order_by`. TypeScript, ESM, zero runtime dependencies.

This is an **independent implementation** of Google's AIP specifications. It is not a Google product and is not affiliated with or endorsed by Google. Its behaviour is tested against einride's [aip-go](https://github.com/einride/aip-go); see [CONFORMANCE.md](CONFORMANCE.md) for what was ported and where the spec leaves room for interpretation.

> **Precedence warning.** In AIP-160, `OR` binds *tighter* than `AND`, unlike most languages. `a AND b OR c` means `a AND (b OR c)`. Whitespace-separated terms (`a b`) bind between the two. The printer always parenthesises nested groups so printed filters are unambiguous.

## Install

The package is private for now. Once published:

```sh
pnpm add aip-parsers
```

Entry points: `aip-parsers/filter` (AIP-160), `aip-parsers/order-by` (AIP-132), and the root, which re-exports both.

## Quick start

```ts
import {
  parseFilter, checkFilter, printFilter, evaluateFilter,
  type Schema,
} from 'aip-parsers/filter'

const parsed = parseFilter('status = paid AND (total >= 100 OR customer.vip = true)')
if (!parsed.ok) console.log(parsed.errors) // typed errors with span and hint
const ast = parsed.ast!

const schema: Schema = {
  fields: {
    status: { type: 'enum', values: ['draft', 'paid', 'sent'] },
    total: { type: 'number' },
    customer: { type: 'message', fields: { vip: { type: 'boolean' } } },
  },
}
const checked = checkFilter(ast, schema)

printFilter(ast)
// status = paid AND (total >= 100 OR customer.vip = true)  (canonical form)

evaluateFilter(ast, { status: 'paid', total: 250, customer: { vip: false } }) // true
```

`parseFilter` never throws. It always returns every error found and a best-effort tree (`ok: false` with `ast` set), so editors can keep highlighting while the user types. `parseFilterOrThrow` throws `FilterSyntaxError` instead.

## AST reference

Every node has `span: { start, end }`, UTF-16 offsets into the source. `lineColumn(source, offset)` converts an offset for display.

Expressions (`Expr`):

| `kind` | Fields | Source |
| --- | --- | --- |
| `sequence` | `args` | `a b c`, whitespace-separated terms (implicit, "fuzzy" AND) |
| `and` | `args` | `a AND b` |
| `or` | `args` | `a OR b` |
| `not` | `arg` | `NOT a`, `-a` |
| `compare` | `op`, `left`, `right` | `a = 1`, `!=`, `<`, `<=`, `>`, `>=` |
| `has` | `left`, `right` | `r:42`, `m:key` |
| `present` | `left` | `r:*` |
| `global` | `value` | a bare value such as `hello` or `"two words"` |
| `call` | `name`, `args` | `regex(m.key, "^a")`, also an operand |

Operands (`Operand`): `member` (`path: string[]`), `string`, `number` (`value` plus exact `raw` text), `boolean`, `duration` (`amount`, `unit`), `timestamp`, `call`, and `binary` (`+`/`-`, only with the arithmetic extension).

A `member` is a dotted path of text. Whether it is a field, a search term or a plain value depends on where it appears: on the left of a comparator it is a field; on the right (`status = paid`) it is a value; alone it is a global restriction. After `checkFilter`, field members carry `field: { name, spec }` and aliases are replaced by the real name.

## Function registry and `checkFilter`

The parser accepts any well-formed `name(args)` call. Consumers declare the functions they support as plain data, together with the field types of the resource:

```ts
const schema: Schema = {
  fields: {
    title: { type: 'string', aliases: ['headline'] },
    notes: { type: 'string', filterable: false },
    tags: { type: 'string', repeated: true },
    labels: { type: 'map', value: { type: 'string' } },
    createdAt: { type: 'timestamp' },
  },
  functions: {
    regex: {
      params: [{ name: 'field', type: 'field', of: ['string'] }, { name: 'pattern', type: 'string' }],
      evaluate: (values, pattern) => (values as string[]).some((v) => new RegExp(pattern as string).test(v)),
    },
    now: { params: [], returns: 'timestamp', evaluate: () => new Date() },
  },
}
```

`checkFilter(ast, schema)` returns `{ ok: true, ast }` or `{ ok: false, errors }` with every problem found. It verifies that:

- fields exist (aliases resolve), are not `filterable: false`, and paths traverse only `message`, `map` and `any` fields;
- values match the field type (enum values, integers, timestamps, durations, booleans), quoted strings being converted as AIP-160 describes;
- operators suit the type: ordering needs string, number, integer, timestamp or duration; repeated, map and message fields need `:`; wildcards only on strings;
- calls name a registered function, match its arity and parameter kinds, and a function used as a condition returns boolean.

Field types: `string`, `integer`, `number`, `boolean`, `timestamp`, `duration`, `enum`, `map`, `message`, `any`; any field may be `repeated`.

Error codes: `unknown-field`, `not-filterable`, `invalid-traversal`, `unknown-function`, `wrong-arity`, `wrong-argument`, `invalid-value`, `operator-not-allowed`, `wildcard-not-allowed`, `not-boolean`. Each error has `message`, `hint` and `span`. Syntax errors use `invalid-unicode`, `unexpected-character`, `unterminated-string`, `invalid-escape`, `invalid-timestamp`, `unexpected-token`, `expected-token`, `too-deep` and `too-long`.

## Evaluator

`evaluateFilter(ast, record, { functions, search })` runs a filter against plain JavaScript values, so the library is complete without a database. Pass a checked AST to let field types decide how quoted values convert; an unchecked AST works too, inferring from the values.

- Numbers compare exactly: plain decimals, `bigint` and numeric strings are compared as decimals, not doubles.
- Timestamps come from `Date` objects or RFC-3339 strings and compare at millisecond precision, across offsets. Durations are numbers of seconds or `{ seconds }`.
- `=` and `!=` on strings treat `*` as a wildcard over the whole string; matching is linear-time.
- `:` matches an element of an array, a key of a `Map` or object, or equality on a plain value. `field:*` tests presence (not null or undefined).
- Paths cross arrays element-wise, so `items.qty > 5` is true when any element matches. `!=` is `NOT =`: a missing value satisfies `!=`.
- A bare value (global restriction) uses `search(text, record)`; the default is a case-insensitive substring search over every string and number in the record.
- Calls run `evaluate` from the registry. `field` parameters receive the array of values found at the path. A call without an implementation throws.

## Extensions beyond AIP-160

Off by default, enabled with `parseFilter(source, { extensions })`:

- `durationUnits`: `30m`, `2h`, `7d`, `1w` in addition to `s`.
- `arithmetic: true`: `now() - 30d`, `a + b` between operands (left-associative). This makes `a = 1 -b` a subtraction.
- `arithmetic: 'now-offset'`: only `now() +/- <duration>`; everywhere else `-b` keeps its AIP-160 meaning, negation.

## order_by (AIP-132)

```ts
import { parseOrderBy, checkOrderBy, printOrderBy } from 'aip-parsers/order-by'

const parsed = parseOrderBy(' createdAt desc , total ')
// { ok: true, items: [{ path: ['createdAt'], direction: 'desc', span }, ...] }
printOrderBy(parsed.items) // "createdAt desc, total"

checkOrderBy(parsed.items, { fields: { createdAt: {}, total: { sortable: false } } })
// { ok: false, errors: [{ code: 'not-sortable', ... }] }
```

The schema is structural: a filter `Schema` is accepted as is. Fields are sortable unless `sortable: false`; subfields and map values are followed; aliases resolve.

## Spec coverage

| AIP-160 feature | Status |
| --- | --- |
| Literals: strings, numbers (int, float, exponent), booleans, durations, RFC-3339 timestamps | Supported. Timestamps may be quoted or bare. |
| `AND`, `OR` (tighter than `AND`), `NOT`, `-`, implicit AND | Supported, with a distinct `sequence` node for implicit AND. |
| Comparisons `= != < <= > >=` | Supported. |
| Has operator `:` including `field:*` | Supported. |
| Traversal `a.b.c` | Supported, including numeric segments. |
| Wildcards in strings with `=` / `!=` | Supported. |
| Functions `name(args)` | Parsed generically; validated and run through a registry. |
| Fuzzy global restrictions | Parsed as `global`; evaluation is pluggable. |
| `order_by` (AIP-132) | Supported. |

## Size

Minified and compressed, each entry point with its shared code (`pnpm size`):

| Entry | Minified | Gzip | Brotli |
| --- | --- | --- | --- |
| `.` (both) | 28.0 kB | 10.1 kB | 9.1 kB |
| `/filter` | 25.4 kB | 9.2 kB | 8.3 kB |
| `/order-by` | 3.1 kB | 1.5 kB | 1.3 kB |

`sideEffects: false`; both entries tree-shake.

## Development

```sh
pnpm install
pnpm check   # typecheck, test, build
pnpm size
```

Licensed under Apache-2.0.
