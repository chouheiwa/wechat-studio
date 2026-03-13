#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const projectRoot = path.resolve(import.meta.dirname, '..')
const outDir = path.join(projectRoot, 'dist')
const outfile = path.join(outDir, 'proxy-server.bundle.cjs')

fs.mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [path.join(projectRoot, 'scripts', 'proxy-server.mjs')],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node25',
  packages: 'bundle',
  banner: {
    js: '#!/usr/bin/env node',
  },
  define: {
    'import.meta.dirname': JSON.stringify(path.join(projectRoot, 'scripts')),
  },
})

fs.chmodSync(outfile, 0o755)
process.stdout.write(`${outfile}\n`)
