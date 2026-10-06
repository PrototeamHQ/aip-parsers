import type { Schema } from '../../src/filter'

export const schema: Schema = {
  fields: {
    id: { type: 'integer' },
    title: { type: 'string', aliases: ['headline'] },
    notes: { type: 'string', filterable: false },
    price: { type: 'number' },
    active: { type: 'boolean' },
    status: { type: 'enum', values: ['draft', 'paid', 'sent'] },
    createdAt: { type: 'timestamp' },
    ttl: { type: 'duration' },
    tags: { type: 'string', repeated: true },
    labels: { type: 'map', value: { type: 'string' } },
    author: { type: 'message', fields: { name: { type: 'string' }, age: { type: 'integer' }, secret: { type: 'string', filterable: false } } },
    items: { type: 'message', repeated: true, fields: { sku: { type: 'string' }, qty: { type: 'integer' } } },
    meta: { type: 'any' },
  },
  functions: {
    regex: { params: [{ name: 'field', type: 'field', of: ['string'] }, { name: 'pattern', type: 'string' }], evaluate: (values, pattern) => (values as string[]).some((v) => new RegExp(pattern as string).test(v)) },
    in: { params: [{ name: 'field', type: 'field' }], rest: { name: 'value', type: 'any' }, evaluate: (values, ...options) => (values as unknown[]).some((v) => options.includes(v)) },
    now: { params: [], returns: 'timestamp', evaluate: () => new Date('2024-06-01T00:00:00Z') },
    length: { params: [{ name: 'field', type: 'field', of: ['string'] }], returns: 'integer', evaluate: (values) => ((values as string[])[0] ?? '').length },
  },
}
