import { diagnostic } from '../shared/diagnostic'
import { suggest } from '../shared/suggest'
import type { OrderByCheck, OrderByError, OrderByItem, SortField, SortSchema } from './types'

const find = (fields: Record<string, SortField>, name: string) => {
  if (Object.hasOwn(fields, name)) return { name, field: fields[name]! }
  const alias = Object.entries(fields).find(([, field]) => field.aliases?.includes(name))
  return alias && { name: alias[0], field: alias[1] }
}

/**
 * Validates order_by items against sortable fields, following nested fields, and replaces
 * aliases with the real field names. Fields are sortable unless marked `sortable: false`.
 */
export const checkOrderBy = (items: OrderByItem[], schema: SortSchema): OrderByCheck => {
  const errors: OrderByError[] = []
  const checked: OrderByItem[] = []
  for (const item of items) {
    const found = find(schema.fields, item.path[0]!)
    if (!found) {
      const usable = Object.entries(schema.fields).filter(([, f]) => f.sortable !== false).map(([name]) => name)
      const close = suggest(item.path[0]!, usable)
      errors.push(diagnostic('unknown-field', `Unknown field "${item.path[0]}"`, close ? `Did you mean "${close}"?` : `Available fields: ${usable.join(', ')}`, item.span))
      continue
    }
    const path = [found.name]
    let field = found.field
    let sortable = field.sortable !== false
    let failed = false
    for (const segment of item.path.slice(1)) {
      const inner = field.fields ? find(field.fields, segment)?.field : field.value
      if (!inner) {
        errors.push(diagnostic('invalid-traversal', `Cannot sort by "${segment}" inside "${path.join('.')}"`, 'Only nested message fields and map values can be traversed', item.span))
        failed = true
        break
      }
      path.push(field.fields ? find(field.fields, segment)!.name : segment)
      field = inner
      sortable &&= field.sortable !== false
    }
    if (failed) continue
    if (!sortable) {
      errors.push(diagnostic('not-sortable', `Field "${path.join('.')}" cannot be sorted on`, 'Mark it sortable in the schema', item.span))
      continue
    }
    checked.push({ ...item, path })
  }
  return errors.length === 0 ? { ok: true, items: checked } : { ok: false, errors }
}
