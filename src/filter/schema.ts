export type ValueType =
  | 'string' | 'integer' | 'number' | 'boolean' | 'timestamp' | 'duration'
  | 'enum' | 'map' | 'message' | 'any'

export type FieldSpec = {
  type: ValueType
  /** A repeated field matches when any element matches; use `:` to test membership. */
  repeated?: boolean
  /** Allowed values when `type` is `enum`. */
  values?: string[]
  /** Nested fields when `type` is `message`. */
  fields?: Record<string, FieldSpec>
  /** Value type when `type` is `map` (keys are strings). */
  value?: FieldSpec
  /** Defaults to true. */
  filterable?: boolean
  /** Used by the order-by checker; defaults to true. */
  sortable?: boolean
  aliases?: string[]
}

export type ParamType =
  | 'field' | 'string' | 'integer' | 'number' | 'boolean' | 'timestamp' | 'duration' | 'any'

export type ParamSpec = {
  name: string
  type: ParamType
  /** For `field` parameters: the field types the function accepts. */
  of?: ValueType[]
}

/**
 * At evaluation, `field` parameters receive the array of values found at the field path
 * (several when the path crosses repeated fields); other parameters receive plain JS values:
 * strings, numbers, booleans, `Date` for timestamps, `{ seconds }` for durations.
 */
export type FunctionSpec = {
  params: ParamSpec[]
  /** Accepts any number of extra arguments of this kind. */
  rest?: ParamSpec
  /** Defaults to `boolean`. */
  returns?: ValueType
  evaluate?: (...args: unknown[]) => unknown
}

export type Schema = {
  fields: Record<string, FieldSpec>
  functions?: Record<string, FunctionSpec>
}
