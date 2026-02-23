/**
 * renderer.mjs - 基于 marked 的微信公众号 HTML 渲染器
 *
 * 读取主题 YAML 中的 colors + renderer 字段，生成带内联 CSS 的微信兼容 HTML。
 */
import { Marked } from 'marked'

const FONT_FAMILY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/**
 * 将 Markdown 渲染为微信公众号 HTML
 * @param {string} markdown
 * @param {object} theme - 已解析的主题 YAML 对象
 * @returns {{ html: string, images: Array<{index, alt, src, type}> }}
 */
export function renderMarkdown(markdown, theme) {
  const colors = theme.colors || {}
  const r = theme.renderer || {}

  const bg = colors.background || '#ffffff'
  const textColor = colors.text || '#333333'
  const primary = colors.primary || '#333333'
  const secondary = colors.secondary || '#555555'
  const quoteBackground = colors.quote_background || '#f5f5f5'

  const fontSize = r.font_size || '16px'
  const lineHeight = r.line_height || '1.75'
  const letterSpacing = r.letter_spacing || '0.3px'
  const h2Icon = r.h2_icon || '▶'
  const h2IconShadow = r.h2_icon_shadow || 'none'
  const cardBgImage = r.card_background_image || 'none'
  const cardBgSize = r.card_background_size || 'auto'
  const cardBorder = r.card_border || '1px solid rgba(0,0,0,0.05)'
  const cardShadow = r.card_shadow || '0 4px 12px rgba(0,0,0,0.05)'
  const cardRadius = r.card_border_radius || '12px'
  const hrStyle = r.hr_style || 'border: none; height: 1px; background-color: rgba(0,0,0,0.1);'

  // 图片收集
  const images = []
  let imgIndex = 0

  const marked = new Marked({ gfm: true, breaks: false })

  marked.use({
    renderer: {
      // 图片 → 占位符（marked v9: image(href, title, text)）
      image(href, title, text) {
        const isOnline = href.startsWith('http://') || href.startsWith('https://')
        images.push({ index: imgIndex, alt: text, src: href, type: isOnline ? 'online' : 'local' })
        return `<!-- IMG:${imgIndex++} -->`
      },

      // 标题（marked v9: heading(text, depth)）
      heading(text, depth) {
        if (depth === 1) {
          return `<h1 style="font-family: ${FONT_FAMILY}; font-size: 22px; font-weight: 700; color: ${primary}; text-align: center; margin: 0 0 8px 0; padding: 0;">${text}</h1>\n`
        }
        if (depth === 2) {
          return (
            `<h2 style="font-family: ${FONT_FAMILY}; font-size: 18px; font-weight: 700; color: ${primary}; border-bottom: 1px dashed rgba(0,0,0,0.15); padding-bottom: 6px; margin: 24px 0 12px 0;">` +
            `<span style="color: ${primary}; text-shadow: ${h2IconShadow}; margin-right: 6px;">${h2Icon}</span>` +
            `<span style="color: ${primary};">${text}</span>` +
            `</h2>\n`
          )
        }
        if (depth === 3) {
          return `<h3 style="font-family: ${FONT_FAMILY}; font-size: 16px; font-weight: 700; color: ${secondary}; border-bottom: 2px solid ${primary}; display: inline-block; padding-bottom: 2px; margin: 20px 0 10px 0;">${text}</h3>\n`
        }
        return `<h${depth} style="font-family: ${FONT_FAMILY}; color: ${textColor}; margin: 16px 0 8px 0;">${text}</h${depth}>\n`
      },

      // 段落（marked v9: paragraph(text)）
      paragraph(text) {
        // 独立图片占位符（整段只有一个占位符）
        if (/^<!--\s*IMG:\d+\s*-->$/.test(text.trim())) {
          return text.trim() + '\n'
        }
        // 段落内含图片占位符：拆分成独立占位符 + 文字段落
        if (/<!--\s*IMG:\d+\s*-->/.test(text)) {
          const parts = text.split(/(<!--\s*IMG:\d+\s*-->)/)
          return parts.map(part => {
            if (/^<!--\s*IMG:\d+\s*-->$/.test(part.trim())) {
              return part.trim() + '\n'
            }
            const clean = part.trim()
            if (!clean) return ''
            return `<p style="font-family: ${FONT_FAMILY}; font-size: ${fontSize}; line-height: ${lineHeight}; color: ${textColor}; margin: 0 0 16px 0;">${clean}</p>\n`
          }).join('')
        }
        return `<p style="font-family: ${FONT_FAMILY}; font-size: ${fontSize}; line-height: ${lineHeight}; color: ${textColor}; margin: 0 0 16px 0;">${text}</p>\n`
      },

      // 加粗
      strong(text) {
        return `<strong style="color: ${secondary}; font-weight: 700;">${text}</strong>`
      },

      // 斜体
      em(text) {
        return `<em style="color: ${textColor}; font-style: italic;">${text}</em>`
      },

      // 引用块（marked v9: blockquote(quote)）
      blockquote(quote) {
        return `<blockquote style="font-family: ${FONT_FAMILY}; background-color: ${quoteBackground}; border-left: 5px solid ${primary}; box-shadow: inset 0 0 12px rgba(0,0,0,0.04); margin: 16px 0; padding: 12px 16px; border-radius: 0 8px 8px 0;">${quote}</blockquote>\n`
      },

      // 代码块（marked v9: code(code, lang)）
      code(code, lang) {
        const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return `<pre style="font-family: 'Courier New', Courier, monospace; background-color: #f6f8fa; border: 1px solid rgba(0,0,0,0.08); border-radius: 6px; padding: 12px 16px; overflow-x: auto; margin: 16px 0;"><code style="font-size: 14px; line-height: 1.6; color: #24292e;">${escaped}</code></pre>\n`
      },

      // 行内代码
      codespan(text) {
        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return `<code style="font-family: 'Courier New', Courier, monospace; font-size: 14px; background-color: rgba(0,0,0,0.06); border-radius: 3px; padding: 1px 5px; color: ${secondary};">${escaped}</code>`
      },

      // 列表（marked v9: list(body, ordered, start)）
      list(body, ordered, start) {
        const tag = ordered ? 'ol' : 'ul'
        const startAttr = ordered && start !== 1 ? ` start="${start}"` : ''
        const listStyle = ordered ? 'list-style-type: decimal;' : 'list-style-type: disc;'
        return `<${tag}${startAttr} style="font-family: ${FONT_FAMILY}; font-size: ${fontSize}; line-height: ${lineHeight}; color: ${textColor}; ${listStyle} padding-left: 24px; margin: 0 0 16px 0;">${body}</${tag}>\n`
      },

      // 列表项（marked v9: listitem(text, task, checked)）
      listitem(text, task, checked) {
        if (task) {
          const checkbox = `<input type="checkbox" ${checked ? 'checked' : ''} disabled style="margin-right: 6px;">`
          return `<li style="margin-bottom: 6px;">${checkbox}${text}</li>`
        }
        return `<li style="margin-bottom: 6px;">${text}</li>`
      },

      // 分割线
      hr() {
        return `<hr style="${hrStyle}" />\n`
      },

      // 链接（marked v9: link(href, title, text)）
      link(href, title, text) {
        const titleAttr = title ? ` title="${title}"` : ''
        return `<a href="${href}"${titleAttr} style="color: ${primary}; text-decoration: none; border-bottom: 1px solid ${primary};">${text}</a>`
      },

      // 表格（marked v9: table(header, body)）
      table(header, body) {
        return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;"><thead>${header}</thead><tbody>${body}</tbody></table>\n`
      },

      tablerow(content) {
        return `<tr>${content}</tr>`
      },

      tablecell(content, { header, align }) {
        const tag = header ? 'th' : 'td'
        const bgColor = header ? quoteBackground : '#ffffff'
        const fontWeight = header ? 'font-weight: 700;' : ''
        const textAlign = align ? `text-align: ${align};` : 'text-align: left;'
        return `<${tag} style="font-family: ${FONT_FAMILY}; font-size: ${fontSize}; color: ${header ? secondary : textColor}; background-color: ${bgColor}; padding: 8px 12px; border: 1px solid rgba(0,0,0,0.08); ${fontWeight} ${textAlign}">${content}</${tag}>`
      },
    }
  })

  // 将 Markdown 按 h2 分割成 section 卡片
  const sections = splitIntoSections(markdown)
  const cardStyle = [
    'background-color: #ffffff',
    `background-image: ${cardBgImage}`,
    `background-size: ${cardBgSize}`,
    `border: ${cardBorder}`,
    `box-shadow: ${cardShadow}`,
    `border-radius: ${cardRadius}`,
    'padding: 25px',
    'max-width: 800px',
    'margin: 0 auto',
    'box-sizing: border-box',
  ].join('; ')

  const sectionGap = r.section_gap || '32px'
  const renderedSections = sections.map((section, i) => {
    const html = marked.parse(section)
    const mb = i < sections.length - 1 ? `margin-bottom: ${sectionGap};` : ''
    return `<section style="${cardStyle}; ${mb}">${html}</section>`
  })

  const wrapperStyle = [
    `background-color: ${bg}`,
    'padding: 40px 10px',
    `font-family: ${FONT_FAMILY}`,
    `font-size: ${fontSize}`,
    `line-height: ${lineHeight}`,
    `letter-spacing: ${letterSpacing}`,
    'box-sizing: border-box',
  ].join('; ')

  const html = `<div style="${wrapperStyle}">\n${renderedSections.join('\n')}\n</div>`

  return { html, images }
}

/**
 * 按标题将 Markdown 分割为多个 section
 * - 文章含 h1：只按 h1 分割，h2 不参与分组
 * - 文章无 h1：按 h2 分割
 */
function splitIntoSections(markdown) {
  const lines = markdown.split('\n')
  const hasH1 = lines.some(l => /^# /.test(l))
  const splitPattern = hasH1 ? /^# / : /^## /
  const sections = []
  let current = []
  for (const line of lines) {
    if (splitPattern.test(line) && current.length > 0) {
      sections.push(current.join('\n'))
      current = [line]
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) {
    sections.push(current.join('\n'))
  }
  return sections.filter(s => s.trim())
}
