import type { FilterError } from '../errors'
import type { Schema } from '../schema'

export type CheckContext = { schema: Schema; errors: FilterError[] }
