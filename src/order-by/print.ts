import type { OrderByItem } from './types'

/** Canonical order_by: `foo desc, bar`; ascending is implicit. */
export const printOrderBy = (items: OrderByItem[]) =>
  items.map((item) => item.path.join('.') + (item.direction === 'desc' ? ' desc' : '')).join(', ')
