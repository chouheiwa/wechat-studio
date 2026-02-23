#!/usr/bin/env node
/**
 * publish.mjs - 一键完成 Markdown → 替换图片 → 最终 HTML
 *
 * 用法:
 *   node scripts/publish.mjs -i article.md -r upload-result.json [-t theme] [-o output.html]
 *
 * 选项:
 *   -i, --input  <file>   输入 Markdown 文件
 *   -r, --result <file>   图片上传结果 JSON（由 upload-image.mjs --output 生成）
 *   -t, --theme  <name>   主题名称（默认: autumn-warm）
 *   -o, --output <file>   输出 HTML 文件（默认: 与输入同名，后缀 .html）
 *   -h, --help            显示帮助
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getArg, hasFlag, exitWithError } from '../lib/args.mjs'
import { renderMarkdown } from '../lib/renderer.mjs'
import { replaceImages } from '../lib/replace.mjs'
import { loadTheme } from '../lib/theme.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2)

if (hasFlag(argv, ['-h', '--help'])) {
  process.stdout.write(`
用法: node scripts/publish.mjs [选项]

选项:
  -i, --input  <file>   输入 Markdown 文件
  -r, --result <file>   图片上传结果 JSON（由 upload-image.mjs --output 生成）
  -t, --theme  <name>   主题名称（默认: autumn-warm）
  -o, --output <file>   输出 HTML 文件（默认: 与输入同名，后缀 .html）
  -h, --help            显示帮助

示例:
  node scripts/publish.mjs -i article.md -r upload-result.json -t autumn-warm -o article-final.html
`)
  process.exit(0)
}

const inputFile  = getArg(argv, ['-i', '--input'])
const resultFile = getArg(argv, ['-r', '--result'])
const themeName  = getArg(argv, ['-t', '--theme']) || 'autumn-warm'
const outputFile = getArg(argv, ['-o', '--output']) ||
  (inputFile ? path.join(path.dirname(inputFile), path.basename(inputFile, path.extname(inputFile)) + '.html') : null)

if (!inputFile)  exitWithError('缺少 -i 参数')
if (!resultFile) exitWithError('缺少 -r 参数')
if (!outputFile) exitWithError('缺少 -o 参数')
if (!fs.existsSync(inputFile))  exitWithError(`文件不存在: ${inputFile}`)
if (!fs.existsSync(resultFile)) exitWithError(`文件不存在: ${resultFile}`)

// ── 加载主题 ──────────────────────────────────────────────────────────────────
const theme = loadTheme(themeName, __dirname)
if (!theme) exitWithError(`找不到主题: ${themeName}`)

// ── Step 1: 渲染 Markdown → HTML（含占位符）─────────────────────────────────

const markdown = fs.readFileSync(inputFile, 'utf-8')
const { html: rawHtml, images } = renderMarkdown(markdown, theme)

process.stderr.write(`🖼️  包含 ${images.length} 张图片占位符\n`)

// ── Step 2: 替换占位符为 <img> 标签 ─────────────────────────────────────────

const results = JSON.parse(fs.readFileSync(resultFile, 'utf-8'))
if (!Array.isArray(results)) exitWithError('结果 JSON 格式错误：需要数组')

const { output: finalHtml, replaced, failed } = replaceImages(rawHtml, results)

// ── Step 3: 写入最终文件 ─────────────────────────────────────────────────────

fs.writeFileSync(outputFile, finalHtml)
process.stderr.write(`✅ 替换完成：${replaced} 处成功${failed ? `，${failed} 处跳过` : ''}\n`)
process.stderr.write(`💾 已保存到: ${outputFile}\n`)

if (failed > 0) process.exit(1)
