import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { exitWithError } from './args.mjs'

/**
 * 从 themes/ 目录加载主题 YAML 文件。
 * 优先查找 process.cwd()/themes，其次查找 scriptDir/../themes。
 *
 * @param {string} name      主题名称（不含 .yaml 后缀）
 * @param {string} scriptDir 调用脚本所在目录（import.meta 的 __dirname）
 * @returns {object|null}    解析后的主题对象，找不到时返回 null
 */
export function loadTheme(name, scriptDir) {
  const themeDirs = [
    path.join(process.cwd(), 'themes'),
    path.join(scriptDir, '..', 'themes'),
  ]
  for (const dir of themeDirs) {
    const filePath = path.join(dir, `${name}.yaml`)
    if (fs.existsSync(filePath)) {
      try { return yaml.load(fs.readFileSync(filePath, 'utf-8')) }
      catch (e) { exitWithError(`主题文件解析失败: ${filePath}\n${e.message}`) }
    }
  }
  return null
}
