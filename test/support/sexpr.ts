import type { Node } from '../../src/filter'

/** Compact notation for comparing trees: text is bare, strings are quoted, groups are lists. */
export const sexpr = (node: Node): string => {
  switch (node.kind) {
    case 'member':
      return node.path.join('.')
    case 'string':
      return JSON.stringify(node.value)
    case 'number':
      return node.raw
    case 'boolean':
      return String(node.value)
    case 'duration':
      return `${node.amount}${node.unit}`
    case 'timestamp':
      return node.value
    case 'call':
      return `(call ${[node.name, ...node.args.map(sexpr)].join(' ')})`
    case 'binary':
      return `(${node.op} ${sexpr(node.left)} ${sexpr(node.right)})`
    case 'and':
    case 'or':
    case 'sequence':
      return `(${node.kind} ${node.args.map(sexpr).join(' ')})`
    case 'not':
      return `(not ${sexpr(node.arg)})`
    case 'compare':
      return `(${node.op} ${sexpr(node.left)} ${sexpr(node.right)})`
    case 'has':
      return `(: ${sexpr(node.left)} ${sexpr(node.right)})`
    case 'present':
      return `(: ${sexpr(node.left)} *)`
    case 'global':
      return sexpr(node.value)
  }
}
