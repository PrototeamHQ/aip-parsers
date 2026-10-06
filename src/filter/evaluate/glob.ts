/**
 * Whole-string match where each `*` matches any run of characters (including none).
 * Linear scan with backtracking to the last star, so hostile patterns cannot blow up.
 */
export const globMatch = (pattern: string, text: string) => {
  let p = 0
  let t = 0
  let star = -1
  let resume = 0
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === '*') {
      star = p++
      resume = t
    } else if (p < pattern.length && pattern[p] === text[t]) {
      p++
      t++
    } else if (star >= 0) {
      p = star + 1
      t = ++resume
    } else {
      return false
    }
  }
  while (pattern[p] === '*') p++
  return p === pattern.length
}
