/**
 * Values found at a dotted path. Arrays on the way are traversed element-wise, so a path
 * through repeated fields can yield several values; a missing path yields none.
 */
export const resolvePath = (record: unknown, path: string[]): unknown[] => {
  let current: unknown[] = [record]
  for (const segment of path) {
    current = current.flatMap((value) => {
      if (Array.isArray(value)) return value.flatMap((item) => step(item, segment))
      return step(value, segment)
    })
  }
  return current.filter((value) => value !== undefined && value !== null)
}

const step = (value: unknown, segment: string): unknown[] => {
  if (typeof value !== 'object' || value === null) return []
  if (value instanceof Map) return value.has(segment) ? [value.get(segment)] : []
  return Object.hasOwn(value, segment) ? [(value as Record<string, unknown>)[segment]] : []
}

/** One level of array flattening, so repeated fields compare per element. */
export const elements = (values: unknown[]) => values.flatMap((value) => (Array.isArray(value) ? value : [value]))
