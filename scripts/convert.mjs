#!/usr/bin/env node
/**
 * convert.mjs - Markdown → 微信主题 AI prompt
 *
 * 用法:
 *   node scripts/convert.mjs -i article.md [-t theme] [-o output.txt]
 *   cat article.md | node scripts/convert.mjs [-t theme]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { getArg, hasFlag, exitWithError } from '../lib/args.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── 参数解析 ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)

const inputFile = getArg(argv, ['-i', '--input'])
const outputFile = getArg(argv, ['-o', '--output'])
const themeName = getArg(argv, ['-t', '--theme']) || 'autumn-warm'
const customPrompt = getArg(argv, ['--custom-prompt'])

if (hasFlag(argv, ['-h', '--help'])) {
  process.stdout.write(`
用法: node scripts/convert.mjs [选项]

选项:
  -i, --input <file>         输入 Markdown 文件 (默认: stdin)
  -t, --theme <name>         主题名称 (默认: autumn-warm)
  --custom-prompt <prompt>   自定义 AI 提示词 (覆盖主题)
  -o, --output <file>        输出文件 (默认: stdout)
  -h, --help                 显示帮助

可用主题: autumn-warm, spring-fresh, ocean-calm
`)
  process.exit(0)
}

// ── 读取 Markdown ──────────────────────────────────────────────────────────────

let markdown = ''
if (inputFile) {
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

// ── 提取标题 ──────────────────────────────────────────────────────────────────

function parseTitle(md) {
  const m = md.match(/^#\s+(.+)/m)
  return m ? m[1].trim() : ''
}

// ── 提取图片引用 ──────────────────────────────────────────────────────────────

function extractImages(md) {
  const images = []
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g
  let m, idx = 0
  while ((m = re.exec(md)) !== null) {
    const src = m[2]
    const isOnline = src.startsWith('http://') || src.startsWith('https://')
    images.push({ index: idx++, alt: m[1], src, type: isOnline ? 'online' : 'local' })
  }
  return images
}

// ── 加载主题 ──────────────────────────────────────────────────────────────────

function loadTheme(name) {
  const themeDirs = [
    path.join(process.cwd(), 'themes'),
    path.join(__dirname, '..', 'themes'),
  ]
  for (const dir of themeDirs) {
    const filePath = path.join(dir, `${name}.yaml`)
    if (fs.existsSync(filePath)) {
      try {
        return yaml.load(fs.readFileSync(filePath, 'utf-8'))
      } catch { /* skip */ }
    }
  }
  return null
}

// ── 构建 prompt ───────────────────────────────────────────────────────────────

function buildPrompt() {
  if (customPrompt) {
    return `${customPrompt}\n\n重要规则:\n1. 图片使用占位符格式：<!-- IMG:index -->，例如第一张图用 <!-- IMG:0 -->\n2. 只使用安全的 HTML 标签，所有样式使用内联 CSS\n3. 返回完整的 HTML，不需要其他说明文字\n\n请转换以下 Markdown 内容：\n\n\`\`\`\n${markdown}\n\`\`\``
  }

  const theme = loadTheme(themeName)
  if (!theme || !theme.prompt) {
    return `请将以下 Markdown 内容转换为适合微信公众号的 HTML 格式。

要求：
- 使用内联 CSS 样式，不使用外部 CSS
- 图片使用占位符格式：<!-- IMG:index -->（第一张用 <!-- IMG:0 -->）
- 只使用微信兼容的 HTML 标签
- 返回完整 HTML，不需要其他说明

Markdown 内容：

\`\`\`
${markdown}
\`\`\``
  }

  // 替换主题 prompt 中的变量
  let prompt = theme.prompt
  prompt = prompt.replace(/\{\{MARKDOWN\}\}/g, markdown)
  prompt = prompt.replace(/\{\{THEME_NAME\}\}/g, theme.name || themeName)
  prompt = prompt.replace(/\{\{TITLE\}\}/g, parseTitle(markdown))

  // 如果主题 prompt 没有内嵌 markdown，追加到末尾
  if (!prompt.includes(markdown)) {
    prompt += `\n\n\`\`\`\n${markdown}\n\`\`\``
  }

  return prompt
}

// ── 输出 ──────────────────────────────────────────────────────────────────────

const images = extractImages(markdown)
const title = parseTitle(markdown)
const prompt = buildPrompt()

const result = {
  success: true,
  mode: 'ai',
  action: 'ai_request',
  theme: themeName,
  title,
  images,
  prompt,
}

const output = JSON.stringify(result, null, 2)

if (outputFile) {
  fs.writeFileSync(outputFile, output)
  process.stderr.write(`✅ 已保存到: ${outputFile}\n`)
} else {
  process.stdout.write(output + '\n')
}
