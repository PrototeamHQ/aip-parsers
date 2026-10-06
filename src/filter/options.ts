export type Extensions = {
  /**
   * Not part of AIP-160. `true` allows `+` and `-` between any operands, which makes
   * `a = 1 -b` a subtraction. `'now-offset'` allows only `now() +/- <duration>`, so `-b`
   * keeps its AIP-160 meaning (negation) everywhere else.
   */
  arithmetic?: boolean | 'now-offset'
  /** Durations with m, h, d and w suffixes. AIP-160 only defines `s`. */
  durationUnits?: boolean
}

export type ParseOptions = {
  extensions?: Extensions
  /** Nesting limit for groups and negations. Defaults to 64. */
  maxDepth?: number
  /** Longest accepted source in UTF-16 units. Defaults to 10000. */
  maxLength?: number
}
