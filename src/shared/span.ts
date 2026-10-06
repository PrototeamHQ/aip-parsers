/** Half-open range of UTF-16 offsets into the source text. */
export type Span = { start: number; end: number }

export const joinSpans = (a: Span, b: Span): Span => ({ start: a.start, end: b.end })

/** 1-based line and column of an offset, for editors and error messages. */
export const lineColumn = (source: string, offset: number) => {
  const before = source.slice(0, offset)
  const line = before.split('\n').length
  return { line, column: offset - (before.lastIndexOf('\n') + 1) + 1 }
}
