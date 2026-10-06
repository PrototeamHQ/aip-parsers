const escapes: Record<string, string> = {
  '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\x07': '\\a', '\b': '\\b', '\f': '\\f', '\v': '\\v',
}

/** Double-quoted string with backslashes, quotes and control characters escaped. */
export const quote = (value: string) => {
  if (!value.isWellFormed()) throw new Error('Strings with unpaired surrogates cannot be printed')
  return `"${value.replace(/[\\"\u0000-\u001f\u007f-\u009f]/g, (char) => escapes[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`
}
