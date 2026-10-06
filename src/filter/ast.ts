import type { Span } from '../shared/span'
import type { FieldSpec } from './schema'

/** Set on members by `check`: the schema field the path resolved to (aliases canonicalised). */
export type ResolvedField = { name: string; spec: FieldSpec }

/**
 * A dotted path of text. Whether it is a field reference, a search term or a plain value
 * depends on where it appears (AIP-160 `member`).
 */
export type Member = { kind: 'member'; path: string[]; field?: ResolvedField; span: Span }

export type DurationUnit = 's' | 'm' | 'h' | 'd' | 'w'

export type StringLiteral = { kind: 'string'; value: string; span: Span }
/** `raw` is the source text, exact for values beyond double precision. */
export type NumberLiteral = { kind: 'number'; value: number; raw: string; span: Span }
export type BooleanLiteral = { kind: 'boolean'; value: boolean; span: Span }
export type DurationLiteral = { kind: 'duration'; amount: number; unit: DurationUnit; span: Span }
export type TimestampLiteral = { kind: 'timestamp'; value: string; span: Span }

export type Literal =
  | StringLiteral | NumberLiteral | BooleanLiteral | DurationLiteral | TimestampLiteral

export type Call = { kind: 'call'; name: string; args: Arg[]; span: Span }

/** Only produced with the `arithmetic` extension. */
export type Binary = { kind: 'binary'; op: '+' | '-'; left: Operand; right: Operand; span: Span }

export type Operand = Member | Literal | Call | Binary

export type CompareOp = '=' | '!=' | '<' | '<=' | '>' | '>='

/** Whitespace-separated terms (implicit AND). */
export type Sequence = { kind: 'sequence'; args: Expr[]; span: Span }
export type And = { kind: 'and'; args: Expr[]; span: Span }
export type Or = { kind: 'or'; args: Expr[]; span: Span }
export type Not = { kind: 'not'; arg: Expr; span: Span }
export type Compare = { kind: 'compare'; op: CompareOp; left: Operand; right: Operand; span: Span }
export type Has = { kind: 'has'; left: Operand; right: Operand; span: Span }
/** `field:*` */
export type Present = { kind: 'present'; left: Operand; span: Span }
/** A bare value: a global restriction such as `hello` or `"two words"`. */
export type Global = { kind: 'global'; value: Operand; span: Span }

export type Expr = Sequence | And | Or | Not | Compare | Has | Present | Global | Call

export type Arg = Operand | Expr

export type Node = Expr | Operand
