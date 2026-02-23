#!/usr/bin/env node
/**
 * replace-images.mjs - 将 HTML 中的 <!-- IMG:N --> 占位符替换为微信图片 URL
 *
 * 用法:
 *   node scripts/replace-images.mjs --html <html_file> --result <upload_result.json> [--output <out.html>]
 *
 * 选项:
 *   --html   <file>   输入 HTML 文件路径
 *   --result <file>   上传结果 JSON 文件（由 upload-image.mjs 或 download-upload.mjs --output 生成）
 *   --output <file>   输出 HTML 文件路径（不指定则输出到 stdout）
 */
import fs from 'node:fs'
import { replaceImages } from '../lib/replace.mjs'

const rawArgs = process.argv.slice(2)

if (!rawArgs.length || rawArgs[0] === '--help' || rawArgs[0] === '-h') {
  process.stdout.write(`
用法:
  node scripts/replace-images.mjs --html <html_file> --result <upload_result.json> [--output <out.html>]

选项:
  --html   <file>   输入 HTML 文件路径
  --result <file>   上传结果 JSON 文件
  --output <file>   输出 HTML 文件路径（不指定则输出到 stdout）
`)
  process.exit(0)
}

function getArg(flag) {
  const idx = rawArgs.indexOf(flag)
  return idx !== -1 ? rawArgs[idx + 1] : null
}

const htmlFile   = getArg('--html')
const resultFile = getArg('--result')
const outputFile = getArg('--output')

try {
  if (!htmlFile)   throw new Error('缺少 --html 参数')
  if (!resultFile) throw new Error('缺少 --result 参数')
  if (!fs.existsSync(htmlFile))   throw new Error(`HTML 文件不存在: ${htmlFile}`)
  if (!fs.existsSync(resultFile)) throw new Error(`结果文件不存在: ${resultFile}`)

  const html    = fs.readFileSync(htmlFile, 'utf-8')
  const results = JSON.parse(fs.readFileSync(resultFile, 'utf-8'))
  if (!Array.isArray(results)) throw new Error('结果 JSON 格式错误：需要数组')

  const { output, replaced, failed } = replaceImages(html, results)

  process.stderr.write(`✅ 替换完成：${replaced} 处成功${failed ? `，${failed} 处跳过` : ''}\n`)

  if (outputFile) {
    fs.writeFileSync(outputFile, output)
    process.stderr.write(`💾 已写入: ${outputFile}\n`)
  } else {
    process.stdout.write(output)
  }

  if (failed > 0) process.exit(1)
} catch (err) {
  process.stderr.write(`❌ 错误: ${err.message}\n`)
  process.exit(1)
}
