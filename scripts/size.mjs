// Minifies each entry point with its shared chunks and reports minified, gzip and brotli sizes.
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join, posix } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

const out = '.size'
rmSync(out, { recursive: true, force: true })
execFileSync('pnpm', ['exec', 'tsdown', '--config-loader', 'native', '--minify', '--no-dts', '--out-dir', out], { stdio: 'ignore' })

const entries = ['index.js', 'filter/index.js', 'order-by/index.js']

const graph = (file, seen = new Set()) => {
  if (seen.has(file)) return seen
  seen.add(file)
  const source = readFileSync(join(out, file), 'utf8')
  for (const match of source.matchAll(/from\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    graph(posix.join(posix.dirname(file), match[1]), seen)
  }
  return seen
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`
const rows = entries.map((entry) => {
  const code = Buffer.concat([...graph(entry)].map((file) => readFileSync(join(out, file))))
  return `| ${entry.replace('/index.js', '').replace('index.js', '(root)')} | ${kb(code.length)} | ${kb(gzipSync(code).length)} | ${kb(brotliCompressSync(code).length)} |`
})

console.log(['| Entry | Minified | Gzip | Brotli |', '| --- | --- | --- | --- |', ...rows].join('\n'))
rmSync(out, { recursive: true, force: true })
