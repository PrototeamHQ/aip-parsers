import { diagnostic } from '../../shared/diagnostic'
import { suggest } from '../../shared/suggest'
import type { Arg, Call, Operand } from '../ast'
import type { ParamSpec, ValueType } from '../schema'
import type { CheckContext } from './context'
import { resolveMember } from './field'
import { checkValue, compatible } from './value'

export type CheckedOperand = { node: Operand; type: ValueType | undefined }

export type OperandChecker = (ctx: CheckContext, node: Operand) => CheckedOperand | undefined

const isOperandArg = (arg: Arg): arg is Operand =>
  ['member', 'string', 'number', 'boolean', 'duration', 'timestamp', 'call', 'binary'].includes(arg.kind)

// Checks one argument against its parameter; returns the (possibly resolved) argument.
const checkArg = (ctx: CheckContext, param: ParamSpec, arg: Arg, checkOperand: OperandChecker): Arg | undefined => {
  if (!isOperandArg(arg)) {
    ctx.errors.push(diagnostic('wrong-argument', `Argument "${param.name}" must be a value`, 'Pass a field, literal or function call', arg.span))
    return undefined
  }
  if (param.type === 'field') {
    if (arg.kind !== 'member') {
      ctx.errors.push(diagnostic('wrong-argument', `Argument "${param.name}" must be a field`, 'Pass a field name without quotes', arg.span))
      return undefined
    }
    const resolved = resolveMember(ctx, arg)
    if (resolved && param.of && !param.of.includes(resolved.field!.spec.type)) {
      ctx.errors.push(diagnostic('wrong-argument', `Argument "${param.name}" cannot be a ${resolved.field!.spec.type} field`, `Accepted field types: ${param.of.join(', ')}`, arg.span))
      return undefined
    }
    return resolved
  }
  const checked = checkOperand(ctx, arg)
  if (!checked) return undefined
  if (param.type === 'any') return checked.node
  const problem = checked.type && (arg.kind === 'call' || arg.kind === 'binary')
    ? compatible(param.type, checked.type) ? undefined : { message: `Expected ${param.type}`, hint: `Argument "${param.name}" is ${checked.type}` }
    : checkValue(param.type, undefined, checked.node)
  if (problem) ctx.errors.push(diagnostic('wrong-argument', problem.message, problem.hint, arg.span))
  return problem ? undefined : checked.node
}

export const checkCall = (ctx: CheckContext, call: Call, checkOperand: OperandChecker) => {
  const functions = ctx.schema.functions ?? {}
  if (!Object.hasOwn(functions, call.name)) {
    const close = suggest(call.name, Object.keys(functions))
    ctx.errors.push(
      diagnostic('unknown-function', `Unknown function "${call.name}"`, close ? `Did you mean "${close}"?` : `Available functions: ${Object.keys(functions).join(', ') || 'none'}`, call.span),
    )
    return undefined
  }
  const fn = functions[call.name]!
  const min = fn.params.length
  if (call.args.length < min || (!fn.rest && call.args.length > min)) {
    const expectedCount = fn.rest ? `at least ${min}` : String(min)
    ctx.errors.push(
      diagnostic('wrong-arity', `${call.name}() takes ${expectedCount} argument(s) but got ${call.args.length}`, `Usage: ${call.name}(${[...fn.params, ...(fn.rest ? [fn.rest] : [])].map((p) => p.name).join(', ')})`, call.span),
    )
    return undefined
  }
  const args = call.args.map((arg, i) => checkArg(ctx, fn.params[i] ?? fn.rest!, arg, checkOperand))
  if (args.some((arg) => arg === undefined)) return undefined
  return { call: { ...call, args: args as Arg[] }, returns: fn.returns ?? 'boolean' }
}
