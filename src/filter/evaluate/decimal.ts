/** Exact decimal number, so values beyond double precision compare correctly. */
export class Decimal {
  constructor(
    readonly int: bigint,
    readonly scale: number,
  ) {}

  compare(other: Decimal) {
    const scale = Math.max(this.scale, other.scale)
    const a = this.int * 10n ** BigInt(scale - this.scale)
    const b = other.int * 10n ** BigInt(scale - other.scale)
    return a < b ? -1 : a > b ? 1 : 0
  }

  toNumber() {
    return Number(`${this.int}e-${this.scale}`)
  }
}

const plain = /^(-?)(\d+)(?:\.(\d+))?$/

/** Parses plain decimal text such as `-12.50`; undefined for exponents, hex and other text. */
export const parseDecimal = (text: string) => {
  const match = plain.exec(text)
  if (!match) return undefined
  const fraction = match[3] ?? ''
  return new Decimal(BigInt(`${match[1]}${match[2]}${fraction}`), fraction.length)
}

export const decimalOf = (value: unknown) => {
  if (typeof value === 'bigint') return new Decimal(value, 0)
  if (typeof value === 'number') return Number.isFinite(value) ? parseDecimal(String(value)) : undefined
  if (typeof value === 'string') return parseDecimal(value)
  return value instanceof Decimal ? value : undefined
}
