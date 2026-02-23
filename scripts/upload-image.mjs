#!/usr/bin/env node
/**
 * upload-image.mjs - 上传本地图片到微信素材库
 *
 * 用法:
 *   # 单张
 *   node scripts/upload-image.mjs <file_path> [--no-cache]
 *
 *   # 批量（JSON 文件，内容为路径字符串数组）
 *   node scripts/upload-image.mjs --json <json_file> [--output <result_file>] [--no-cache]
 */
import fs from 'node:fs'
import { loadConfig } from '../lib/config.mjs'
import { uploadMaterialCached, uploadMaterialBatch } from '../lib/wechat.mjs'
import { compressImage, isValidImageFormat } from '../lib/image.mjs'
const rawArgs = process.argv.slice(2)
if (!rawArgs.length || rawArgs[0] === '--help' || rawArgs[0] === '-h') {
  process.stdout.write(`
用法:
  # 单张
  node scripts/upload-image.mjs <file_path> [--no-cache]
  # 批量（JSON 文件，内容为路径字符串数组）
  node scripts/upload-image.mjs --json <json_file> [--output <result_file>] [--no-cache]
JSON 文件格式:
  ["images/photo1.jpg", "images/photo2.png"]
选项:
  --output <file>  将批量上传结果写入 JSON 文件（可供 replace-images.mjs 使用）
  --no-cache       跳过缓存，强制重新上传
单张输出:
  { "success": true, "media_id": "...", "wechat_url": "..." }
批量输出:
  [{ "file": "...", "success": true, "media_id": "...", "wechat_url": "..." }, ...]
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

try {
  const cfg = loadConfig('strict')
  if (isBatch) {
    // 批量模式：从 JSON 文件读取路径列表
    const jsonFile = rawArgs[jsonIdx + 1]
    if (!jsonFile) throw new Error('--json 参数后需要指定 JSON 文件路径')
    if (!fs.existsSync(jsonFile)) throw new Error(`文件不存在: ${jsonFile}`)
    const filePaths = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'))
    if (!Array.isArray(filePaths) || !filePaths.every(p => typeof p === 'string')) {
      throw new Error('JSON 格式错误：需要字符串数组，例如 ["img1.jpg", "img2.png"]')
    }
    if (!filePaths.length) throw new Error('JSON 文件中没有图片路径')
    for (const fp of filePaths) {
      if (!fs.existsSync(fp)) throw new Error(`文件不存在: ${fp}`)
      if (!isValidImageFormat(fp)) throw new Error(`不支持的图片格式: ${fp}`)
    }
    // 并发压缩
    const compressed = await Promise.all(filePaths.map(fp => compressImage(fp, {
      maxWidth: cfg.maxImageWidth,
      maxSize: cfg.maxImageSize,
    })))
    const outputPaths = compressed.map(({ outputPath, compressed: c }, i) => {
      if (c) process.stderr.write(`🗜️  已压缩: ${filePaths[i]}\n`)
      return outputPath
    })
    const results = await uploadMaterialBatch(cfg, outputPaths, { useCache })
    // 清理临时压缩文件
    compressed.forEach(({ outputPath, compressed: c }, i) => {
      if (c && outputPath !== filePaths[i]) {
        try { fs.unlinkSync(outputPath) } catch { /* ignore */ }
      }
    })
    const output = results.map((r, i) => ({
      file: filePaths[i],
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
  } else {
    // 单张模式
    const filePath = rawArgs.filter(a => !a.startsWith('--'))[0]
    if (!filePath) throw new Error('请指定图片路径，或使用 --json 批量上传')
    if (!fs.existsSync(filePath)) throw new Error(`文件不存在: ${filePath}`)
    if (!isValidImageFormat(filePath)) throw new Error(`不支持的图片格式: ${filePath}`)
    const { outputPath, compressed } = await compressImage(filePath, {
      maxWidth: cfg.maxImageWidth,
      maxSize: cfg.maxImageSize,
    })
    if (compressed) process.stderr.write(`🗜️  已压缩: ${filePath}\n`)
    const result = await uploadMaterialCached(cfg, outputPath, { useCache })
    if (compressed && outputPath !== filePath) {
      try { fs.unlinkSync(outputPath) } catch { /* ignore */ }
    }
    process.stdout.write(JSON.stringify({
      success: true,
      media_id: result.mediaId,
      wechat_url: result.wechatUrl,
    }, null, 2) + '\n')
  }
} catch (err) {
  process.stderr.write(JSON.stringify({ success: false, error: err.message }, null, 2) + '\n')
  process.exit(1)
}
