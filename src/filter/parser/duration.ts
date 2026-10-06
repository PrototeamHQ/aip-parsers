import type { DurationLiteral, DurationUnit } from '../ast'
import type { Token } from '../lexer/lexer'

export const durationFrom = (token: Token): DurationLiteral => ({
  kind: 'duration',
  amount: Number(token.text.slice(0, -1)),
  unit: token.text.slice(-1) as DurationUnit,
  span: token.span,
})
