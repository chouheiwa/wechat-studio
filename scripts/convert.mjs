#!/usr/bin/env node
/**
 * convert.mjs - Markdown → 微信公众号 HTML
 *
 * 用法:
 *   node scripts/convert.mjs -i article.md [-t theme] [-o output.html]
 *   cat article.md | node scripts/convert.mjs [-t theme]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getArg, hasFlag, exitWithError } from '../lib/args.mjs'
import { renderMarkdown } from '../lib/renderer.mjs'
import { loadTheme } from '../lib/theme.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── 参数解析 ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)

const inputFile = getArg(argv, ['-i', '--input'])
const outputFile = getArg(argv, ['-o', '--output'])
const themeName = getArg(argv, ['-t', '--theme']) || 'autumn-warm'

if (hasFlag(argv, ['-h', '--help'])) {
  process.stdout.write(`
用法: node scripts/convert.mjs [选项]

选项:
  -i, --input <file>   输入 Markdown 文件 (默认: stdin)
  -t, --theme <name>   主题名称 (默认: autumn-warm)
  -o, --output <file>  输出 HTML 文件 (默认: stdout)
  -h, --help           显示帮助

可用主题: autumn-warm, spring-fresh, ocean-calm
`)
  process.exit(0)
}

// ── 读取 Markdown ──────────────────────────────────────────────────────────────

let markdown = ''
if (inputFile) {
  if (!fs.existsSync(inputFile)) exitWithError(`文件不存在: ${inputFile}`)
  markdown = fs.readFileSync(inputFile, 'utf-8')
} else {
  try {
    const stat = fs.fstatSync(0)
    if (!(stat.mode & 0o0020000)) {
      markdown = fs.readFileSync('/dev/stdin', 'utf-8')
    }
  } catch { /* 无 stdin */ }
}

if (!markdown.trim()) {
  exitWithError('未提供输入内容。使用 -i <file> 或通过 stdin 输入')
}

// ── 加载主题 ──────────────────────────────────────────────────────────────────
const theme = loadTheme(themeName, __dirname)
if (!theme) {
  exitWithError(`找不到主题: ${themeName}。可用主题: autumn-warm, spring-fresh, ocean-calm`)
}

// ── 渲染 ──────────────────────────────────────────────────────────────────────

const { html, images } = renderMarkdown(markdown, theme)

// ── 输出 ──────────────────────────────────────────────────────────────────────

if (outputFile) {
  fs.writeFileSync(outputFile, html)
  process.stderr.write(`✅ 已保存到: ${outputFile}\n`)
  if (images.length > 0) {
    process.stderr.write(`🖼️  包含 ${images.length} 张图片占位符 (<!-- IMG:0 --> ~ <!-- IMG:${images.length - 1} -->)\n`)
  }
} else {
  process.stdout.write(html + '\n')
}
