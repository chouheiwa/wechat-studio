/**
 * replace.mjs - 将 HTML 中的 <!-- IMG:N --> 占位符替换为 <img> 标签
 *
 * @param {string} html - 含占位符的 HTML 字符串
 * @param {Array}  results - upload-image.mjs 输出的结果数组
 * @returns {{ output: string, replaced: number, failed: number }}
 */
export function replaceImages(html, results) {
  let replaced = 0
  let failed = 0

  const output = html.replace(/<!--\s*IMG:(\d+)\s*-->/g, (match, indexStr) => {
    const index = parseInt(indexStr, 10)
    const item = results[index]
    if (!item) {
      process.stderr.write(`⚠️  占位符 ${match} 对应的结果不存在（索引 ${index} 超出范围）\n`)
      failed++
      return match
    }
    if (!item.success || !item.wechat_url) {
      process.stderr.write(`⚠️  占位符 ${match} 对应的上传失败（${item.error || '无 wechat_url'}）\n`)
      failed++
      return match
    }
    replaced++
    return `<img src="${item.wechat_url}" style="width: 100%; display: block; margin: 0 auto;" />`
  })

  return { output, replaced, failed }
}
