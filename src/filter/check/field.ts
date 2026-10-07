import { diagnostic } from '../../shared/diagnostic'
import { suggest } from '../../shared/suggest'
import type { Member } from '../ast'
import type { FieldSpec } from '../schema'
import type { CheckContext } from './context'

const findField = (fields: Record<string, FieldSpec>, name: string) => {
  if (Object.hasOwn(fields, name)) return { name, spec: fields[name]! }
  const alias = Object.entries(fields).find(([, spec]) => spec.aliases?.includes(name))
  return alias && { name: alias[0], spec: alias[1] }
}

/**
 * Resolves a member against the schema, following message fields and map keys. Aliases are
 * replaced by the real field name in the returned member.
 */
export const resolveMember = (ctx: CheckContext, member: Member): Member | undefined => {
  const head = member.path[0]!
  const found = findField(ctx.schema.fields, head)
  if (!found) {
    const usable = Object.entries(ctx.schema.fields).filter(([, s]) => s.filterable !== false).map(([name]) => name)
    const close = suggest(head, usable)
    ctx.errors.push(
      diagnostic('unknown-field', `Unknown field "${head}"`, close ? `Did you mean "${close}"?` : `Available fields: ${usable.join(', ')}`, member.span),
    )
    return undefined
  }
  const path = [found.name]
  let spec = found.spec
  let filterable = spec.filterable !== false
  for (const segment of member.path.slice(1)) {
    const inner = spec.type === 'message' ? spec.fields?.[segment] : spec.type === 'map' ? spec.value : spec.type === 'any' ? spec : undefined
    if (!inner || (spec.type === 'message' && !Object.hasOwn(spec.fields ?? {}, segment))) {
      ctx.errors.push(
        diagnostic('invalid-traversal', `Cannot traverse into "${segment}" of "${path.join('.')}"`, spec.type === 'message' ? `Available fields: ${Object.keys(spec.fields ?? {}).join(', ')}` : 'Only message, map and any fields can be traversed', member.span),
      )
      return undefined
    }
    path.push(segment)
    spec = inner
    filterable &&= spec.filterable !== false
  }
  if (!filterable) {
    ctx.errors.push(diagnostic('not-filterable', `Field "${path.join('.')}" cannot be filtered on`, 'Mark it filterable in the schema', member.span))
    return undefined
  }
  return { ...member, path, field: { name: path.join('.'), spec } }
}
