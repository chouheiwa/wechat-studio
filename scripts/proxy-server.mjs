#!/usr/bin/env node

/**
 * 微信 API 远程服务器（Server Mode）
 * 部署在固定 IP 服务器上，暴露 API 接口供客户端调用
 * 服务器持有微信凭证，直接调用微信 API
 *
 * 用法:
 *   node scripts/proxy-server.mjs --port 8080 --secret your-proxy-secret
 *   PROXY_PORT=8080 PROXY_SECRET=your-proxy-secret node scripts/proxy-server.mjs
 *
 * 接口:
 *   POST /api/access-token    - 获取 Access Token
 *   POST /api/upload-material  - 上传图片素材
 *   POST /api/create-draft     - 创建图文草稿
 */

import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { getArg } from '../lib/args.mjs'
import { loadConfig } from '../lib/config.mjs'
import { getAccessToken, uploadMaterial, createDraft } from '../lib/wechat.mjs'

const SECRET_HEADER = 'x-proxy-secret'
const MAX_BODY_SIZE = 10 * 1024 * 1024 // 10MB

// ─── 配置解析 ──────────────────────────────────────────────────────────────

function resolveServerConfig(argv) {
  const port = Number(getArg(argv, ['--port', '-p']) || process.env.PROXY_PORT || '8080')
  const secret = getArg(argv, ['--secret', '-s']) || process.env.PROXY_SECRET || ''

  if (!secret) {
    process.stderr.write('错误: 必须通过 --secret 或 PROXY_SECRET 环境变量提供认证密钥\n')
    process.exit(1)
  }

  if (Number.isNaN(port) || port < 1 || port > 65535) {
    process.stderr.write(`错误: 无效端口号 "${port}"，需要 1-65535 范围内的整数\n`)
    process.exit(1)
  }

  return { port, secret }
}

// ─── 请求解析工具 ──────────────────────────────────────────────────────────

/**
 * 收集请求体（带大小限制）
 */
function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0

    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_SIZE) {
        req.destroy()
        reject(new Error(`请求体超过 ${MAX_BODY_SIZE / 1024 / 1024}MB 限制`))
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * 从 multipart/form-data 中提取文件
 * 返回临时文件路径（调用方负责清理）
 */
function parseMultipartFile(body, contentType) {
  const boundaryMatch = contentType.match(/boundary=(.+?)(?:;|$)/)
  if (!boundaryMatch) throw new Error('缺少 multipart boundary')

  const boundary = boundaryMatch[1]
  const boundaryBuf = Buffer.from(`--${boundary}`)

  // 查找第一个 boundary 后的 header 和 body
  const start = body.indexOf(boundaryBuf)
  if (start === -1) throw new Error('无效的 multipart 数据')

  const headerEnd = body.indexOf('\r\n\r\n', start)
  if (headerEnd === -1) throw new Error('无效的 multipart header')

  const headerStr = body.slice(start + boundaryBuf.length + 2, headerEnd).toString('utf-8')

  // 提取文件名
  const filenameMatch = headerStr.match(/filename="(.+?)"/)
  const filename = filenameMatch ? filenameMatch[1] : 'upload.bin'
  const ext = path.extname(filename) || '.bin'

  // 提取文件内容（header 结束到下一个 boundary 之间）
  const fileStart = headerEnd + 4
  const endBoundary = Buffer.from(`\r\n--${boundary}`)
  const fileEnd = body.indexOf(endBoundary, fileStart)
  const fileData = fileEnd !== -1 ? body.slice(fileStart, fileEnd) : body.slice(fileStart)

  // 写入临时文件
  const tmpPath = path.join(os.tmpdir(), `wechat-proxy-${crypto.randomBytes(8).toString('hex')}${ext}`)
  fs.writeFileSync(tmpPath, fileData)
  return tmpPath
}

/**
 * 发送 JSON 响应
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

// ─── 路由处理 ──────────────────────────────────────────────────────────────

/**
 * POST /api/access-token
 */
async function handleAccessToken(cfg, res) {
  const token = await getAccessToken(cfg)
  sendJson(res, 200, { access_token: token })
}

/**
 * POST /api/upload-material
 * 接收 multipart/form-data 文件，上传到微信
 */
async function handleUploadMaterial(cfg, req, res) {
  const contentType = req.headers['content-type'] || ''
  if (!contentType.includes('multipart/form-data')) {
    sendJson(res, 400, { error: '需要 multipart/form-data 格式' })
    return
  }

  const body = await collectBody(req)
  const tmpPath = parseMultipartFile(body, contentType)

  try {
    const result = await uploadMaterial(cfg, tmpPath)
    sendJson(res, 200, { media_id: result.mediaId, url: result.wechatUrl })
  } finally {
    // 清理临时文件
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
  }
}

/**
 * POST /api/create-draft
 * 接收 JSON { articles, label }
 */
async function handleCreateDraft(cfg, req, res) {
  const body = await collectBody(req)
  const { articles, label } = JSON.parse(body.toString('utf-8'))

  if (!articles || !Array.isArray(articles)) {
    sendJson(res, 400, { error: 'articles 必须为数组' })
    return
  }

  const result = await createDraft(cfg, articles, label || '图文草稿')
  sendJson(res, 200, { media_id: result.mediaId })
}

// ─── 服务器入口 ─────────────────────────────────────────────────────────────

function startServer() {
  const { port, secret } = resolveServerConfig(process.argv.slice(2))

  // 服务器端加载微信凭证（不加载 proxy 配置，避免递归）
  const cfg = loadConfig('strict')
  // 确保服务器端不使用 proxy（直连微信 API）
  const serverCfg = { ...cfg, proxy: null }

  const routes = {
    '/api/access-token': handleAccessToken,
    '/api/upload-material': handleUploadMaterial,
    '/api/create-draft': handleCreateDraft,
  }

  const server = http.createServer(async (req, res) => {
    const timestamp = new Date().toISOString()
    process.stderr.write(`[${timestamp}] ${req.method} ${req.url}\n`)

    // 仅接受 POST
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: '仅支持 POST 方法' })
      return
    }

    // 验证认证密钥
    if (req.headers[SECRET_HEADER] !== secret) {
      sendJson(res, 403, { error: '认证失败: X-Proxy-Secret 不匹配' })
      return
    }

    // 路由匹配
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname
    const handler = routes[pathname]
    if (!handler) {
      sendJson(res, 404, { error: `未知接口: ${pathname}` })
      return
    }

    try {
      await handler(serverCfg, req, res)
    } catch (err) {
      process.stderr.write(`[${timestamp}] 处理失败: ${err.message}\n`)
      if (!res.headersSent) {
        sendJson(res, 500, { error: err.message })
      }
    }
  })

  server.listen(port, () => {
    process.stderr.write(`微信 API 服务器已启动 (Server Mode)\n`)
    process.stderr.write(`监听端口: ${port}\n`)
    process.stderr.write(`接口列表:\n`)
    process.stderr.write(`  POST /api/access-token    - 获取 Access Token\n`)
    process.stderr.write(`  POST /api/upload-material  - 上传图片素材\n`)
    process.stderr.write(`  POST /api/create-draft     - 创建图文草稿\n`)
    process.stderr.write(`认证方式: X-Proxy-Secret 请求头\n`)
  })

  server.on('error', (err) => {
    process.stderr.write(`服务器启动失败: ${err.message}\n`)
    process.exit(1)
  })
}

startServer()
