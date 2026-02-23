#!/usr/bin/env node
/**
 * download-upload.mjs - 下载在线图片并上传到微信素材库
 *
 * 用法:
 *   # 单张
 *   node scripts/download-upload.mjs <url> [--no-cache]
 *
 *   # 批量（JSON 文件，内容为 URL 字符串数组）
 *   node scripts/download-upload.mjs --json <json_file> [--output <result_file>] [--no-cache]
 */
import fs from 'node:fs'
import { loadConfig } from '../lib/config.mjs'
import { uploadMaterialCached, uploadMaterialBatch, downloadFile } from '../lib/wechat.mjs'
import { compressImage, isValidImageFormat } from '../lib/image.mjs'
const rawArgs = process.argv.slice(2)
if (!rawArgs.length || rawArgs[0] === '--help' || rawArgs[0] === '-h') {
  process.stdout.write(`
用法:
  # 单张
  node scripts/download-upload.mjs <url> [--no-cache]
  # 批量（JSON 文件，内容为 URL 字符串数组）
  node scripts/download-upload.mjs --json <json_file> [--output <result_file>] [--no-cache]
JSON 文件格式:
  ["https://a.com/1.jpg", "https://b.com/2.png"]
选项:
  --output <file>  将批量上传结果写入 JSON 文件（可供 replace-images.mjs 使用）
  --no-cache       跳过缓存，强制重新上传

单张输出:
  { "success": true, "media_id": "...", "wechat_url": "...", "original_url": "..." }
批量输出:
  [{ "original_url": "...", "success": true, "media_id": "...", "wechat_url": "..." }, ...]
需要配置:
  WECHAT_APP_ID / WECHAT_SECRET 环境变量
  或 ~/.config/wechat-studio/config.yaml
`)
  process.exit(0)
}
const useCache = !rawArgs.includes('--no-cache')
const jsonIdx = rawArgs.indexOf('--json')
const isBatch = jsonIdx !== -1
const outputIdx = rawArgs.indexOf('--output')
const outputFile = outputIdx !== -1 ? rawArgs[outputIdx + 1] : null


const cfg = loadConfig('strict')
const tmpFiles = []
try {
  let urls
  if (isBatch) {
    // 批量模式：从 JSON 文件读取 URL 列表
    const jsonFile = rawArgs[jsonIdx + 1]
    if (!jsonFile) throw new Error('--json 参数后需要指定 JSON 文件路径')
    if (!fs.existsSync(jsonFile)) throw new Error(`文件不存在: ${jsonFile}`)
    urls = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'))
    if (!Array.isArray(urls) || !urls.every(u => typeof u === 'string')) {
      throw new Error('JSON 格式错误：需要字符串数组，例如 ["https://a.com/1.jpg"]')
    }
    if (!urls.length) throw new Error('JSON 文件中没有 URL')
  } else {
    // 单张模式
    const url = rawArgs.filter(a => !a.startsWith('--'))[0]
    if (!url) throw new Error('请指定 URL，或使用 --json 批量下载')
    urls = [url]
  }
  for (const url of urls) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error(`无效的 URL: ${url}`)
    }
  }
  // 并发下载所有图片
  process.stderr.write(`⬇️  正在下载 ${urls.length} 张图片...\n`)
  const downloaded = await Promise.all(urls.map(async (url) => {
    const tmpPath = await downloadFile(url)
    tmpFiles.push(tmpPath)
    return { url, tmpPath }
  }))
  // 校验格式
  for (const { url, tmpPath } of downloaded) {
    if (!isValidImageFormat(tmpPath)) throw new Error(`不支持的图片格式: ${url}`)
  }
  // 并发压缩
  const compressResults = await Promise.all(downloaded.map(({ tmpPath }) =>
    compressImage(tmpPath, { maxWidth: cfg.maxImageWidth, maxSize: cfg.maxImageSize })
  ))
  compressResults.forEach(({ compressed, outputPath }, i) => {
    if (compressed) process.stderr.write(`🗜️  已压缩: ${downloaded[i].url}\n`)
    if (outputPath !== downloaded[i].tmpPath) tmpFiles.push(outputPath)
  })
  const outputPaths = compressResults.map(r => r.outputPath)
  if (urls.length === 1) {
    // 单张：保持原有输出格式
    const result = await uploadMaterialCached(cfg, outputPaths[0], { useCache })
    process.stdout.write(JSON.stringify({
      success: true,
      media_id: result.mediaId,
      wechat_url: result.wechatUrl,
      original_url: urls[0],
    }, null, 2) + '\n')
  } else {
    // 批量：并发上传，输出数组
    const results = await uploadMaterialBatch(cfg, outputPaths, { useCache })
    const output = results.map((r, i) => ({
      original_url: urls[i],
      success: r.success,
      ...(r.success ? { media_id: r.mediaId, wechat_url: r.wechatUrl } : { error: r.error }),
    }))
    const json = JSON.stringify(output, null, 2)
    process.stdout.write(json + '\n')
    if (outputFile) {
      fs.writeFileSync(outputFile, json)
      process.stderr.write(`💾 结果已写入: ${outputFile}\n`)
    }
    if (output.some(r => !r.success)) process.exit(1)

  }
} catch (err) {
  process.stderr.write(JSON.stringify({ success: false, error: err.message }, null, 2) + '\n')
  process.exit(1)
} finally {
  for (const p of tmpFiles) {
    try { fs.unlinkSync(p) } catch { /* ignore */ }
  }
}
