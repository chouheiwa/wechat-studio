/**
 * 图片压缩处理
 * 使用 sharp（可选），未安装时跳过压缩
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const VALID_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

export function isValidImageFormat(filePath) {
  return VALID_EXTS.has(path.extname(filePath).toLowerCase())
}

/**
 * 压缩图片
 * @returns {{ outputPath: string, compressed: boolean }}
 */
export async function compressImage(filePath, { maxWidth = 1920, maxSize = 5 * 1024 * 1024, quality = 85 } = {}) {
  const stat = fs.statSync(filePath)
  if (stat.size <= maxSize) {
    return { outputPath: filePath, compressed: false }
  }

  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    process.stderr.write('⚠️  sharp 未安装，跳过图片压缩\n')
    return { outputPath: filePath, compressed: false }
  }

  const ext = path.extname(filePath).toLowerCase()
  const tmpPath = path.join(os.tmpdir(), `wechat-studio-${crypto.randomBytes(8).toString('hex')}${ext}`)

  const img = sharp(filePath).resize({ width: maxWidth, withoutEnlargement: true })

  if (ext === '.png') {
    await img.png({ quality }).toFile(tmpPath)
  } else if (ext === '.gif') {
    fs.copyFileSync(filePath, tmpPath)
  } else {
    await img.jpeg({ quality }).toFile(tmpPath)
  }

  return { outputPath: tmpPath, compressed: true }
}
