#!/usr/bin/env node
/**
 * download-upload.mjs - 下载在线图片并上传到微信素材库
 *
 * 用法:
 *   node scripts/download-upload.mjs <url>
 */

import fs from 'node:fs'
import os from 'node:os'
import { loadConfig } from '../lib/config.mjs'
import { uploadMaterialWithRetry, downloadFile } from '../lib/wechat.mjs'
import { compressImage, isValidImageFormat } from '../lib/image.mjs'

const args = process.argv.slice(2)

if (!args.length || args[0] === '--help' || args[0] === '-h') {
  process.stdout.write(`
用法: node scripts/download-upload.mjs <url>

下载在线图片并上传到微信公众号素材库。

输出 JSON:
  { "success": true, "media_id": "...", "wechat_url": "...", "original_url": "..." }

需要配置:
  WECHAT_APP_ID / WECHAT_SECRET 环境变量
  或 ~/.config/wechat-studio/config.yaml
`)
  process.exit(0)
}

const url = args[0]
let tmpPath = null

try {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error(`无效的 URL: ${url}`)
  }

  const cfg = loadConfig('strict')

  process.stderr.write(`⬇️  正在下载: ${url}\n`)
  tmpPath = await downloadFile(url)

  if (!isValidImageFormat(tmpPath)) {
    throw new Error(`不支持的图片格式: ${tmpPath}`)
  }

  const { outputPath, compressed } = await compressImage(tmpPath, {
    maxWidth: cfg.maxImageWidth,
    maxSize: cfg.maxImageSize,
  })

  if (compressed) process.stderr.write('🗜️  已压缩图片\n')

  const result = await uploadMaterialWithRetry(cfg, outputPath)

  // 清理临时文件
  const toClean = new Set([tmpPath, compressed ? outputPath : null].filter(Boolean))
  for (const p of toClean) {
    try { fs.unlinkSync(p) } catch { /* ignore */ }
  }

  process.stdout.write(JSON.stringify({
    success: true,
    media_id: result.mediaId,
    wechat_url: result.wechatUrl,
    original_url: url,
  }, null, 2) + '\n')

} catch (err) {
  if (tmpPath) try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
  process.stderr.write(JSON.stringify({ success: false, error: err.message }, null, 2) + '\n')
  process.exit(1)
}
