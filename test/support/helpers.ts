import { parseFilter, type ParseOptions } from '../../src/filter'
import { sexpr } from './sexpr'

export const parse = (source: string, options?: ParseOptions) => {
  const result = parseFilter(source, options)
  if (!result.ok || !result.ast) throw new Error(`parse failed for ${source}: ${JSON.stringify(result.errors)}`)
  return result.ast
}

export const tree = (source: string, options?: ParseOptions) => sexpr(parse(source, options))

export const errorsOf = (source: string, options?: ParseOptions) => {
  const result = parseFilter(source, options)
  if (result.ok) throw new Error(`expected errors for ${source}`)
  return result.errors
}

export const stripSpans = <T>(node: T): T =>
  JSON.parse(JSON.stringify(node, (key, value) => (key === 'span' ? undefined : value)))
