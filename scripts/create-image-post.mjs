#!/usr/bin/env node
/**
 * create-image-post.mjs - 创建微信小绿书（图片消息）
 *
 * 用法:
 *   node scripts/create-image-post.mjs -t "标题" --images img1.jpg,img2.jpg [-c "描述"]
 *   node scripts/create-image-post.mjs -t "标题" -m article.md
 *   node scripts/create-image-post.mjs -t "标题" --images img1.jpg --dry-run
 */

import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from '../lib/config.mjs'
import { uploadMaterialWithRetry, createDraft } from '../lib/wechat.mjs'
import { compressImage, isValidImageFormat } from '../lib/image.mjs'
import { getArg, hasFlag, exitWithError } from '../lib/args.mjs'

const MAX_IMAGES = 20

// ── 参数解析 ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)

if (hasFlag(argv, ['-h', '--help'])) {
  process.stdout.write(`
用法: node scripts/create-image-post.mjs [选项]

选项:
  -t, --title <title>        帖子标题（必填）
  -c, --content <text>       帖子描述文字
  --images <paths>           图片路径，逗号分隔（最多 ${MAX_IMAGES} 张）
  -m, --from-markdown <file> 从 Markdown 文件提取图片
  --open-comment             开启评论
  --fans-only                仅粉丝可评论
  --dry-run                  预览模式，不实际创建
  -o, --output <file>        保存结果到 JSON 文件

示例:
  node scripts/create-image-post.mjs -t "标题" --images a.jpg,b.jpg
  node scripts/create-image-post.mjs -t "标题" -m article.md --dry-run
`)
  process.exit(0)
}

const title = getArg(argv, ['-t', '--title'])
const content = getArg(argv, ['-c', '--content']) || ''
const imagesArg = getArg(argv, ['--images'])
const fromMarkdown = getArg(argv, ['-m', '--from-markdown'])
const outputFile = getArg(argv, ['-o', '--output'])
const openComment = hasFlag(argv, ['--open-comment']) ? 1 : 0
const fansOnly = hasFlag(argv, ['--fans-only']) ? 1 : 0
const dryRun = hasFlag(argv, ['--dry-run'])

if (!title) {
  exitWithError('--title 是必填项')
}

// ── 提取图片列表 ──────────────────────────────────────────────────────────────

function extractImagesFromMarkdown(mdFile) {
  const md = fs.readFileSync(mdFile, 'utf-8')
  const dir = path.dirname(path.resolve(mdFile))
  const re = /!\[[^\]]*\]\(([^)]+)\)/g
  const images = []
  let m
  while ((m = re.exec(md)) !== null) {
    const src = m[1]
    if (src.startsWith('http://') || src.startsWith('https://')) continue
    images.push(path.resolve(dir, src))
  }
  return images
}

let imagePaths = imagesArg
  ? imagesArg.split(',').map(s => s.trim()).filter(Boolean)
  : []

if (fromMarkdown) {
  if (!fs.existsSync(fromMarkdown)) {
    exitWithError(`Markdown 文件不存在: ${fromMarkdown}`)
  }
  imagePaths = [...imagePaths, ...extractImagesFromMarkdown(fromMarkdown)]
}

if (!imagePaths.length) {
  exitWithError('需要 --images 或 --from-markdown 提供图片')
}

if (imagePaths.length > MAX_IMAGES) {
  exitWithError(`图片数量超出限制: ${imagePaths.length} 张（最多 ${MAX_IMAGES} 张）`)
}

// ── 验证图片 ──────────────────────────────────────────────────────────────────

for (const img of imagePaths) {
  if (!fs.existsSync(img)) {
    exitWithError(`图片文件不存在: ${img}`)
  }
  if (!isValidImageFormat(img)) {
    exitWithError(`不支持的图片格式: ${img}`)
  }
}

// ── Dry-run 模式 ──────────────────────────────────────────────────────────────

if (dryRun) {
  const preview = {
    title,
    content,
    image_count: imagePaths.length,
    images: imagePaths,
    open_comment: openComment,
    fans_only: fansOnly,
  }

  if (outputFile) {
    fs.writeFileSync(outputFile, JSON.stringify(preview, null, 2))
    process.stderr.write(`✅ 预览已保存到: ${outputFile}\n`)
  }

  process.stdout.write(JSON.stringify({ mode: 'dry-run', preview }, null, 2) + '\n')
  process.exit(0)
}

// ── 上传图片 + 创建草稿 ───────────────────────────────────────────────────────

try {
  const cfg = loadConfig('strict')
  const uploadedIds = []

  for (const imgPath of imagePaths) {
    process.stderr.write(`⬆️  上传图片: ${path.basename(imgPath)}\n`)

    const { outputPath, compressed } = await compressImage(imgPath, {
      maxWidth: cfg.maxImageWidth,
      maxSize: cfg.maxImageSize,
    })

    const { mediaId } = await uploadMaterialWithRetry(cfg, outputPath)
    uploadedIds.push(mediaId)

    if (compressed && outputPath !== imgPath) {
      try { fs.unlinkSync(outputPath) } catch { /* ignore */ }
    }
  }

  const article = {
    title,
    content,
    need_open_comment: openComment,
    only_fans_can_comment: fansOnly,
    image_info: { list: uploadedIds.map(id => ({ media_id: id })) },
  }

  const result = await createDraft(cfg, [article], '小绿书草稿')

  const output = {
    success: true,
    media_id: result.mediaId,
    image_count: uploadedIds.length,
    uploaded_ids: uploadedIds,
  }

  if (outputFile) {
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2))
    process.stderr.write(`✅ 结果已保存到: ${outputFile}\n`)
  }

  process.stdout.write(JSON.stringify(output, null, 2) + '\n')

} catch (err) {
  exitWithError(err.message)
}
