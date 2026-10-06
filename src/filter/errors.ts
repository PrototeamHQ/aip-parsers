import type { Diagnostic } from '../shared/diagnostic'

export type FilterErrorCode =
  | 'invalid-unicode'
  | 'unexpected-character'
  | 'unterminated-string'
  | 'invalid-escape'
  | 'invalid-timestamp'
  | 'unexpected-token'
  | 'expected-token'
  | 'too-deep'
  | 'too-long'
  | 'unknown-field'
  | 'not-filterable'
  | 'invalid-traversal'
  | 'unknown-function'
  | 'wrong-arity'
  | 'wrong-argument'
  | 'invalid-value'
  | 'operator-not-allowed'
  | 'wildcard-not-allowed'
  | 'not-boolean'

export type FilterError = Diagnostic<FilterErrorCode>

export class FilterSyntaxError extends Error {
  constructor(readonly errors: FilterError[]) {
    super(errors[0]!.message)
  }
}
