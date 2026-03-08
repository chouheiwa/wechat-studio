/**
 * 配置加载
 * 加载顺序: 环境变量 > YAML 配置文件 > 默认值
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import yaml from 'js-yaml'

const DEFAULTS = {
  compressImages: true,
  maxImageWidth: 1920,
  maxImageSize: 5 * 1024 * 1024,
  httpTimeout: 30,
  proxy: null,
}

/** 配置文件搜索路径（优先级从高到低） */
const CONFIG_PATHS = [
  path.join(process.cwd(), 'wechat-studio.yaml'),
  path.join(os.homedir(), '.wechat-studio.yaml'),
  path.join(os.homedir(), '.config', 'wechat-studio', 'config.yaml'),
]

function findConfigFile() {
  for (const p of CONFIG_PATHS) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function parseYaml(filePath) {
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf-8')) || {}
  } catch {
    return {}
  }
}

/**
 * 加载配置
 * @param {'strict'|'soft'} mode strict 模式要求微信凭证，soft 模式仅警告
 * @returns {object}
 */
export function loadConfig(mode = 'soft') {
  const cfg = { ...DEFAULTS }

  const configFile = findConfigFile()
  if (configFile) {
    const fileData = parseYaml(configFile)
    if (fileData.wechat) {
      cfg.wechatAppID = fileData.wechat.appid || fileData.wechat.app_id || ''
      cfg.wechatSecret = fileData.wechat.secret || ''
    }
    cfg.wechatAppID = cfg.wechatAppID || fileData.wechat_appid || fileData.wechatAppID || ''
    cfg.wechatSecret = cfg.wechatSecret || fileData.wechat_secret || fileData.wechatSecret || ''
    cfg.compressImages = fileData.compress_images ?? fileData.compressImages ?? cfg.compressImages
    cfg.maxImageWidth = fileData.max_image_width ?? fileData.maxImageWidth ?? cfg.maxImageWidth
    cfg.maxImageSize = fileData.max_image_size ?? fileData.maxImageSize ?? cfg.maxImageSize
    cfg.httpTimeout = fileData.http_timeout ?? fileData.httpTimeout ?? cfg.httpTimeout
    if (fileData.proxy && fileData.proxy.url && fileData.proxy.secret) {
      cfg.proxy = { url: fileData.proxy.url, secret: fileData.proxy.secret }
    }
    if (configFile) cfg._configFile = configFile
  }

  // 环境变量覆盖
  cfg.wechatAppID = process.env.WECHAT_APP_ID || process.env.WECHAT_APPID || cfg.wechatAppID || ''
  cfg.wechatSecret = process.env.WECHAT_SECRET || cfg.wechatSecret || ''

  // 代理配置：环境变量覆盖
  const proxyUrl = process.env.WECHAT_PROXY_URL
  const proxySecret = process.env.WECHAT_PROXY_SECRET
  if (proxyUrl && proxySecret) {
    cfg.proxy = { url: proxyUrl, secret: proxySecret }
  }

  if (configFile) {
    process.stderr.write(`✅ 使用配置文件: ${configFile.replace(os.homedir(), '~')}\n`)
  }

  if (mode === 'strict' && !cfg.proxy) {
    if (!cfg.wechatAppID || !cfg.wechatSecret) {
      throw new Error(
        '缺少微信凭证。请设置环境变量 WECHAT_APP_ID / WECHAT_SECRET，' +
        '或创建配置文件 (~/.config/wechat-studio/config.yaml)，' +
        '或配置 proxy 使用 Server Mode'
      )
    }
  }

  return cfg
}
