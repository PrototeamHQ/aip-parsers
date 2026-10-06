import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'filter/index': 'src/filter/index.ts',
    'order-by/index': 'src/order-by/index.ts',
  },
  format: 'esm',
  dts: true,
  clean: true,
  platform: 'neutral',
  target: 'es2023',
})
