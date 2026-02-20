#!/usr/bin/env node
/**
 * upload-image.mjs - 上传本地图片到微信素材库
 *
 * 用法:
 *   node scripts/upload-image.mjs <file_path>
 */

import fs from 'node:fs'
import os from 'node:os'
import { loadConfig } from '../lib/config.mjs'
import { uploadMaterialWithRetry } from '../lib/wechat.mjs'
import { compressImage, isValidImageFormat } from '../lib/image.mjs'

const args = process.argv.slice(2)

if (!args.length || args[0] === '--help' || args[0] === '-h') {
  process.stdout.write(`
用法: node scripts/upload-image.mjs <file_path>

将本地图片上传到微信公众号素材库。

输出 JSON:
  { "success": true, "media_id": "...", "wechat_url": "..." }

需要配置:
  WECHAT_APP_ID / WECHAT_SECRET 环境变量
  或 ~/.config/wechat-studio/config.yaml
`)
  process.exit(0)
}

const filePath = args[0]

try {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`)
  }

  if (!isValidImageFormat(filePath)) {
    throw new Error(`不支持的图片格式: ${filePath}`)
  }

  const cfg = loadConfig('strict')

  // 压缩（若需要）
  const { outputPath, compressed } = await compressImage(filePath, {
    maxWidth: cfg.maxImageWidth,
    maxSize: cfg.maxImageSize,
  })

  if (compressed) {
    process.stderr.write(`🗜️  已压缩: ${filePath}\n`)
  }

  const result = await uploadMaterialWithRetry(cfg, outputPath)

  // 清理临时压缩文件
  if (compressed && outputPath !== filePath) {
    try { fs.unlinkSync(outputPath) } catch { /* ignore */ }
  }

  process.stdout.write(JSON.stringify({
    success: true,
    media_id: result.mediaId,
    wechat_url: result.wechatUrl,
  }, null, 2) + '\n')

} catch (err) {
  process.stderr.write(JSON.stringify({ success: false, error: err.message }, null, 2) + '\n')
  process.exit(1)
}
