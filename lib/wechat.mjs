/**
 * 微信公众号 API
 * 纯 node:https 实现，无第三方 SDK
 */

import https from 'node:https'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'

// ─── 上传缓存（MD5 → { mediaId, wechatUrl }）──────────────────────────────
const CACHE_DIR = path.join(os.homedir(), '.config', 'wechat-studio')
const CACHE_FILE = path.join(CACHE_DIR, 'upload-cache.json')

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function saveCache(cache) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
  } catch { /* ignore */ }
}

function fileMd5(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex')
}

/**
 * Access Token 内存缓存
 * NOTE: 此处使用 mutation 是缓存场景的合理例外
 */
const tokenCache = { token: '', expiresAt: 0 }

/**
 * 发起 HTTP/HTTPS 请求
 * @param {string} url - 请求地址
 * @param {object} options - 请求选项
 * @param {Buffer|string|null} body - 请求体
 * @param {{ raw?: boolean }} extra - 额外选项，raw=true 返回 Buffer 而非 string
 * @returns {Promise<string|Buffer>}
 */
function makeRequest(url, options = {}, body = null, extra = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const lib = urlObj.protocol === 'https:' ? https : http
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: (options.timeout || 30) * 1000,
    }

    const req = lib.request(reqOptions, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(makeRequest(res.headers.location, options, body, extra))
        return
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        resolve(extra.raw ? buf : buf.toString('utf-8'))
      })
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })

    if (body) req.write(body)
    req.end()
  })
}

// ─── Server Mode: 远程 API 调用 ─────────────────────────────────────────────

/**
 * 构建服务器 API 请求的公共 headers
 */
function serverHeaders(proxy, extra = {}) {
  return { 'X-Proxy-Secret': proxy.secret, ...extra }
}

/**
 * Server Mode: 获取 Access Token
 */
async function remoteGetAccessToken(proxy) {
  const url = `${proxy.url}/api/access-token`
  const raw = await makeRequest(url, {
    method: 'POST',
    headers: serverHeaders(proxy),
  })
  const data = JSON.parse(raw)
  if (data.error) throw new Error(`[Server] 获取 Access Token 失败: ${data.error}`)
  return data.access_token
}

/**
 * Server Mode: 上传图片素材
 */
async function remoteUploadMaterial(proxy, filePath, timeout) {
  const boundary = crypto.randomBytes(16).toString('hex')
  const body = buildMultipartBody(filePath, boundary)
  const url = `${proxy.url}/api/upload-material`

  const raw = await makeRequest(url, {
    method: 'POST',
    headers: serverHeaders(proxy, {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    }),
    timeout,
  }, body)

  const data = JSON.parse(raw)
  if (data.error) throw new Error(`[Server] 上传图片失败: ${data.error}`)
  return { mediaId: data.media_id, wechatUrl: data.url }
}

/**
 * Server Mode: 创建草稿
 */
async function remoteCreateDraft(proxy, articles, label, timeout) {
  const body = JSON.stringify({ articles, label })
  const url = `${proxy.url}/api/create-draft`

  const raw = await makeRequest(url, {
    method: 'POST',
    headers: serverHeaders(proxy, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    }),
    timeout,
  }, body)

  const data = JSON.parse(raw)
  if (data.error) throw new Error(`[Server] 创建${label}失败: ${data.error}`)
  return { mediaId: data.media_id }
}

// ─── 导出函数（自动切换直连/Server Mode）───────────────────────────────────

/**
 * 获取 Access Token（带缓存）
 */
export async function getAccessToken(cfg) {
  if (cfg.proxy) return remoteGetAccessToken(cfg.proxy)
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache.token && now < tokenCache.expiresAt - 60) {
    return tokenCache.token
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${cfg.wechatAppID}&secret=${cfg.wechatSecret}`
  const raw = await makeRequest(url)
  const data = JSON.parse(raw)

  if (data.errcode) {
    throw new Error(`获取 Access Token 失败: ${data.errmsg} (${data.errcode})`)
  }

  // NOTE: 缓存场景的合理 mutation
  tokenCache.token = data.access_token
  tokenCache.expiresAt = now + (data.expires_in || 7200)
  return tokenCache.token
}

/**
 * 构建 multipart/form-data body
 */
function buildMultipartBody(filePath, boundary) {
  const filename = path.basename(filePath)
  const ext = path.extname(filename).toLowerCase().slice(1)
  const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }
  const mime = mimeMap[ext] || 'application/octet-stream'

  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
  )
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
  const fileData = fs.readFileSync(filePath)

  return Buffer.concat([header, fileData, footer])
}

/**
 * 上传图片素材到微信
 */
export async function uploadMaterial(cfg, filePath) {
  if (cfg.proxy) return remoteUploadMaterial(cfg.proxy, filePath, cfg.httpTimeout)

  const token = await getAccessToken(cfg)
  const boundary = crypto.randomBytes(16).toString('hex')
  const body = buildMultipartBody(filePath, boundary)

  const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=image`
  const raw = await makeRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
    timeout: cfg.httpTimeout,
  }, body)

  const data = JSON.parse(raw)
  if (data.errcode) {
    throw new Error(`上传图片失败: ${data.errmsg} (${data.errcode})`)
  }
  return { mediaId: data.media_id, wechatUrl: data.url }
}

/**
 * 带重试的上传
 */
export async function uploadMaterialWithRetry(cfg, filePath, maxRetries = 3) {
  let lastErr
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await uploadMaterial(cfg, filePath)
    } catch (err) {
      lastErr = err
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
  throw lastErr
}

/**
 * 带缓存去重的上传（相同文件内容直接返回缓存结果）
 * @param {object} cfg
 * @param {string} filePath
 * @param {{ useCache?: boolean }} opts
 */
export async function uploadMaterialCached(cfg, filePath, { useCache = true } = {}) {
  if (useCache) {
    const md5 = fileMd5(filePath)
    const cache = loadCache()
    if (cache[md5]) {
      process.stderr.write(`⚡ 命中缓存，跳过上传: ${filePath}\n`)
      return cache[md5]
    }
    const result = await uploadMaterialWithRetry(cfg, filePath)
    cache[md5] = result
    saveCache(cache)
    return result
  }
  return uploadMaterialWithRetry(cfg, filePath)
}

/**
 * 并发批量上传多张图片
 * @param {object} cfg
 * @param {string[]} filePaths
 * @param {{ concurrency?: number, useCache?: boolean }} opts
 * @returns {Promise<Array<{ filePath: string, success: boolean, mediaId?: string, wechatUrl?: string, error?: string }>>}
 */
export async function uploadMaterialBatch(cfg, filePaths, { concurrency = 3, useCache = true } = {}) {
  const results = []
  // 分批并发，避免触发微信频率限制
  for (let i = 0; i < filePaths.length; i += concurrency) {
    const batch = filePaths.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async (fp) => {
        try {
          const r = await uploadMaterialCached(cfg, fp, { useCache })
          return { filePath: fp, success: true, ...r }
        } catch (err) {
          return { filePath: fp, success: false, error: err.message }
        }
      })
    )
    results.push(...batchResults)
  }
  return results
}

/**
 * 创建草稿（图文 / 小绿书通用）
 * @param {object} cfg - 配置
 * @param {Array} articles - 文章数组
 * @param {string} label - 草稿类型标签，用于错误信息
 */
export async function createDraft(cfg, articles, label = '图文草稿') {
  if (cfg.proxy) return remoteCreateDraft(cfg.proxy, articles, label, cfg.httpTimeout)

  const token = await getAccessToken(cfg)
  const body = JSON.stringify({ articles })
  const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`

  const raw = await makeRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: cfg.httpTimeout,
  }, body)

  const data = JSON.parse(raw)
  if (data.errcode) {
    throw new Error(`创建${label}失败: ${data.errmsg} (${data.errcode})`)
  }
  return { mediaId: data.media_id }
}

/**
 * 下载文件（URL 或本地路径）到临时文件
 */
export async function downloadFile(urlOrPath) {
  if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
    return urlOrPath
  }

  const ext = path.extname(new URL(urlOrPath).pathname) || '.jpg'
  const tmpPath = path.join(os.tmpdir(), `wechat-studio-${crypto.randomBytes(8).toString('hex')}${ext}`)

  const buf = await makeRequest(urlOrPath, {}, null, { raw: true })
  fs.writeFileSync(tmpPath, buf)
  return tmpPath
}
