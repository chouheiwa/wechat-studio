/**
 * CLI 参数解析工具
 */

/**
 * 从命令行参数中获取指定 flag 的值
 * @param {string[]} argv - 参数数组
 * @param {string[]} flags - 要匹配的 flag 列表，如 ['-i', '--input']
 * @returns {string|null}
 */
export function getArg(argv, flags) {
  for (const flag of flags) {
    const idx = argv.indexOf(flag)
    if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1]
  }
  return null
}

/**
 * 检查命令行参数中是否包含指定 flag
 * @param {string[]} argv - 参数数组
 * @param {string[]} flags - 要匹配的 flag 列表
 * @returns {boolean}
 */
export function hasFlag(argv, flags) {
  return flags.some(f => argv.includes(f))
}

/**
 * 统一 JSON 错误输出到 stderr 并退出
 * @param {string} message - 错误信息
 * @param {number} code - 退出码，默认 1
 */
export function exitWithError(message, code = 1) {
  process.stderr.write(JSON.stringify({ success: false, error: message }, null, 2) + '\n')
  process.exit(code)
}
