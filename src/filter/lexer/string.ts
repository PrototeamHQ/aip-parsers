import { diagnostic } from '../../shared/diagnostic'
import type { FilterError } from '../errors'

const simple: Record<string, string> = {
  a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v',
  "'": "'", '"': '"', '\\': '\\', '?': '?', '`': '`',
}

const hexDigits = (source: string, from: number, length: number) => {
  const text = source.slice(from, from + length)
  return text.length === length && /^[0-9a-fA-F]+$/.test(text) ? parseInt(text, 16) : undefined
}

// `at` is the backslash; `end` is the offset after the escape.
const escape = (source: string, at: number): { text: string; end: number } | { error: string; end: number } => {
  const char = source[at + 1]
  if (char === undefined) return { error: 'a backslash at the end', end: at + 1 }
  if (Object.hasOwn(simple, char)) return { text: simple[char]!, end: at + 2 }
  const lengths: Record<string, number> = { x: 2, u: 4, U: 8 }
  if (Object.hasOwn(lengths, char)) {
    const code = hexDigits(source, at + 2, lengths[char]!)
    const end = at + 2 + lengths[char]!
    const valid = code !== undefined && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
    return valid ? { text: String.fromCodePoint(code), end } : { error: `\\${char} needs ${lengths[char]} hex digits naming a Unicode scalar value`, end: at + 2 }
  }
  const octal = /^[0-3][0-7]{2}/.exec(source.slice(at + 1, at + 4))
  if (octal) return { text: String.fromCharCode(parseInt(octal[0], 8)), end: at + 4 }
  return { error: `the escape "\\${char}"`, end: at + 2 }
}

export const scanString = (source: string, start: number) => {
  const quote = source[start]
  const errors: FilterError[] = []
  let value = ''
  let i = start + 1
  while (i < source.length) {
    const char = source[i]!
    if (char === quote) return { end: i + 1, value, errors }
    if (char !== '\\') {
      value += char
      i++
      continue
    }
    const result = escape(source, i)
    if ('text' in result) value += result.text
    else {
      errors.push(
        diagnostic('invalid-escape', `Invalid escape: ${result.error}`, 'Valid escapes: \\a \\b \\f \\n \\r \\t \\v \\\' \\" \\\\ \\? \\` \\xHH \\uXXXX \\UXXXXXXXX \\ooo', {
          start: i,
          end: result.end,
        }),
      )
    }
    i = result.end
  }
  errors.push(
    diagnostic('unterminated-string', 'String is missing its closing quote', `Add a closing ${quote}`, {
      start,
      end: source.length,
    }),
  )
  return { end: source.length, value: undefined, errors }
}
