# wechat-studio

微信公众号内容创作全流程工具：Markdown 排版、风格写作、AI 去痕、图片上传、草稿发布。

## 致谢

本项目受 [geekjourneyx/md2wechat-skill](https://github.com/geekjourneyx/md2wechat-skill) 启发，对其表示感谢。

在使用 md2wechat-skill 的过程中，我发现它作为一个 AI Coding 工具的 skill，承担了过多本应由 AI 完成的工作——比如 HTML 渲染、主题生成等逻辑都内置在工具里，导致 skill 本身变得很重，不够纯粹。

我的理解是：**skill 应该只做 AI 做不好的事**，比如调用微信 API、处理文件 I/O、上传图片。而排版渲染、风格写作、AI 去痕这些，交给 AI 本身来做反而更灵活。

因此我重新设计了这个工具：

- 渲染逻辑用 Node.js 脚本实现，主题通过 YAML 配置，AI 不参与 HTML 生成
- 脚本职责单一，可分步执行，也可一键完成
- skill 层只暴露必要的操作接口，不做多余的事

## 功能

- **Markdown → 微信 HTML**：基于主题 YAML 渲染，样式完全内联，微信兼容
- **图片上传**：本地图片或在线图片上传到微信素材库，支持缓存
- **占位符替换**：将 HTML 中的 `<!-- IMG:N -->` 替换为微信图片 `<img>` 标签
- **一键发布**：Markdown → 渲染 → 替换图片 → 最终 HTML，一条命令完成
- **图文草稿**：创建微信公众号图文草稿
- **小绿书**：创建图片消息帖子
- **风格写作**：Dan Koe 风格写作规范（由 AI 执行，无需脚本）
- **AI 去痕**：22 种 AI 写作模式识别与处理（由 AI 执行，无需脚本）

## 安装

```bash
npm install
```

需要 Node.js 18+。

## 配置

需要微信公众号凭证才能使用上传/草稿功能。

**环境变量：**

```bash
export WECHAT_APP_ID=your_appid
export WECHAT_SECRET=your_secret
```

**或配置文件**（按优先级从高到低）：

```
./wechat-studio.yaml
~/.wechat-studio.yaml
~/.config/wechat-studio/config.yaml
```

```yaml
wechat:
  appid: your_appid
  secret: your_secret
```

## 使用

详见 [SKILL.md](./SKILL.md)。

## 可用主题

| 主题 | 说明 |
|------|------|
| `autumn-warm` | 秋日暖光，橙色调（默认） |
| `spring-fresh` | 春日清新，绿色调 |
| `ocean-calm` | 海洋静谧，蓝色调 |

## 项目结构

```
scripts/
  convert.mjs           # Markdown → 微信 HTML
  upload-image.mjs      # 上传本地图片
  download-upload.mjs   # 下载在线图片并上传
  replace-images.mjs    # 替换 HTML 占位符
  publish.mjs           # 一键：Markdown → 替换图片 → 最终 HTML
  create-draft.mjs      # 创建图文草稿
  create-image-post.mjs # 创建小绿书

lib/                    # 可复用模块（脚本内部使用）
themes/                 # 主题 YAML 文件
writers/                # 写作风格 YAML 文件
```
