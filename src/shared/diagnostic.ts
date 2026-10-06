import type { Span } from './span'

export type Diagnostic<Code extends string> = {
  code: Code
  message: string
  /** What to do about it. */
  hint: string
  span: Span
}

export const diagnostic = <Code extends string>(
  code: Code,
  message: string,
  hint: string,
  span: Span,
): Diagnostic<Code> => ({ code, message, hint, span })
