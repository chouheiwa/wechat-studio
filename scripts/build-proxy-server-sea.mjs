#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const outDir = path.join(projectRoot, 'dist')
const bundlePath = path.join(outDir, 'proxy-server.bundle.cjs')
const exeName = process.platform === 'win32' ? 'wechat-studio-proxy.exe' : 'wechat-studio-proxy'
const outputPath = path.join(outDir, exeName)

const [major] = process.versions.node.split('.').map(Number)
if (major < 25) {
  process.stderr.write('build:proxy-server:sea 需要 Node.js 25+（支持 --build-sea）\n')
  process.exit(1)
}

execFileSync(process.execPath, [path.join(projectRoot, 'scripts', 'build-proxy-server-bundle.mjs')], {
  stdio: 'inherit',
})

const seaConfigPath = path.join(os.tmpdir(), `wechat-studio-sea-${process.pid}.json`)
const seaConfig = {
  main: bundlePath,
  output: outputPath,
  executable: process.execPath,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
}

fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2))

try {
  execFileSync(process.execPath, ['--build-sea', seaConfigPath], { stdio: 'inherit' })
} finally {
  try { fs.unlinkSync(seaConfigPath) } catch { /* ignore */ }
}

if (process.platform !== 'win32') {
  fs.chmodSync(outputPath, 0o755)
}

process.stdout.write(`${outputPath}\n`)
