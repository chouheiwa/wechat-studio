#!/usr/bin/env node
/**
 * create-draft.mjs - 创建微信图文草稿
 *
 * 用法:
 *   node scripts/create-draft.mjs <json_file>
 *
 * JSON 格式:
 *   {
 *     "articles": [{
 *       "title": "标题",
 *       "content": "<p>HTML内容</p>",
 *       "thumb_media_id": "封面图素材ID",
 *       "author": "作者",
 *       "digest": "摘要"
 *     }]
 *   }
 */

import fs from 'node:fs'
import { loadConfig } from '../lib/config.mjs'
import { createDraft } from '../lib/wechat.mjs'

const args = process.argv.slice(2)

if (!args.length || args[0] === '--help' || args[0] === '-h') {
  process.stdout.write(`
用法: node scripts/create-draft.mjs <json_file>

从 JSON 文件创建微信图文草稿。

JSON 格式:
  {
    "articles": [{
      "title": "文章标题",
      "content": "<p>HTML 正文内容</p>",
      "thumb_media_id": "封面图素材 ID（必填）",
      "author": "作者名",
      "digest": "文章摘要（可选，最多 120 字）",
      "need_open_comment": 0,
      "only_fans_can_comment": 0
    }]
  }

输出 JSON:
  { "success": true, "media_id": "草稿 media_id" }

需要配置:
  WECHAT_APP_ID / WECHAT_SECRET 环境变量
  或 ~/.config/wechat-studio/config.yaml
`)
  process.exit(0)
}

const jsonFile = args[0]

try {
  if (!fs.existsSync(jsonFile)) {
    throw new Error(`文件不存在: ${jsonFile}`)
  }

  const raw = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'))

  if (!raw.articles || !Array.isArray(raw.articles) || raw.articles.length === 0) {
    throw new Error('JSON 格式错误: 缺少 articles 数组')
  }

  for (const [i, art] of raw.articles.entries()) {
    if (!art.title) throw new Error(`articles[${i}] 缺少 title`)
    if (!art.content) throw new Error(`articles[${i}] 缺少 content`)
    if (!art.thumb_media_id) throw new Error(`articles[${i}] 缺少 thumb_media_id`)
  }

  const cfg = loadConfig('strict')
  const result = await createDraft(cfg, raw.articles)

  process.stdout.write(JSON.stringify({
    success: true,
    media_id: result.mediaId,
  }, null, 2) + '\n')

} catch (err) {
  process.stderr.write(JSON.stringify({ success: false, error: err.message }, null, 2) + '\n')
  process.exit(1)
}
