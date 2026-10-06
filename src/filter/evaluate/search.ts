const maxDepth = 32

const leaves = (value: unknown, depth: number): string[] => {
  if (depth > maxDepth || value === null || value === undefined) return []
  if (typeof value === 'string') return [value]
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return [String(value)]
  if (value instanceof Date) return [value.toISOString()]
  if (Array.isArray(value)) return value.flatMap((item) => leaves(item, depth + 1))
  if (value instanceof Map) return [...value.values()].flatMap((item) => leaves(item, depth + 1))
  if (typeof value === 'object') return Object.values(value).flatMap((item) => leaves(item, depth + 1))
  return []
}

/** Default global restriction: case-insensitive substring over every string and number in the record. */
export const defaultSearch = (text: string, record: unknown) => {
  const needle = text.toLowerCase()
  return leaves(record, 0).some((leaf) => leaf.toLowerCase().includes(needle))
}
