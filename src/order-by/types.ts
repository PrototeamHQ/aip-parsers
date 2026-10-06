import type { Diagnostic } from '../shared/diagnostic'
import type { Span } from '../shared/span'

export type OrderDirection = 'asc' | 'desc'

/** One `field [desc]` entry; `path` has several segments for subfields such as `address.street`. */
export type OrderByItem = { path: string[]; direction: OrderDirection; span: Span }

export type OrderByErrorCode =
  | 'expected-field'
  | 'unexpected-token'
  | 'unknown-field'
  | 'not-sortable'
  | 'invalid-traversal'

export type OrderByError = Diagnostic<OrderByErrorCode>

/** Structural description of sortable fields; a `FieldSpec` from the filter schema fits. */
export type SortField = {
  sortable?: boolean
  aliases?: string[]
  fields?: Record<string, SortField>
  value?: SortField
}

export type SortSchema = { fields: Record<string, SortField> }

export type OrderByParse =
  | { ok: true; items: OrderByItem[]; errors: [] }
  | { ok: false; items: OrderByItem[]; errors: OrderByError[] }

export type OrderByCheck =
  | { ok: true; items: OrderByItem[] }
  | { ok: false; errors: OrderByError[] }
