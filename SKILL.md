---
name: wechat-studio
description: 微信公众号内容创作全流程工具，支持 Markdown 主题排版、Dan Koe 风格写作、AI 去痕、图片上传、图文草稿和小绿书发布。Use this skill when the user asks about WeChat Official Account publishing, converting Markdown to WeChat HTML, uploading images to WeChat, creating drafts, writing in Dan Koe style, or removing AI writing traces (humanize).
---

# WeChat Studio

微信公众号内容创作全流程工具：Markdown 排版、写作助手、AI 去痕、图片上传、草稿发布。

## ⚠️ 路径解析（重要）

本 skill 的脚本位于 SKILL.md 所在目录下。执行任何脚本之前，**必须**先确定本文件的实际路径，并以此推导脚本目录。

**规则：** 以下文档中所有 `$SKILL_DIR` 占位符应替换为本 SKILL.md 文件所在的目录路径。

例如：如果本文件位于 `/Users/xxx/Desktop/AI/skills/wechat-studio/SKILL.md`，则 `$SKILL_DIR` = `/Users/xxx/Desktop/AI/skills/wechat-studio`。

```bash
# 首先确定脚本目录（基于 SKILL.md 所在位置）
SKILL_DIR="<本 SKILL.md 文件所在目录的绝对路径>"
```

---

## 功能一：Markdown → 微信 HTML

**Step 1: 生成 AI prompt**

```bash
node "$SKILL_DIR/scripts/convert.mjs" -i article.md -t autumn-warm
```

输出 JSON 包含 `prompt` 字段。

**Step 2: 执行 prompt**

将 `prompt` 内容发给 AI，AI 返回完整 HTML（所有图片用 `<!-- IMG:0 -->`、`<!-- IMG:1 -->` 占位）。

**Step 3: 替换图片占位符**

JSON 中的 `images` 数组记录了原始图片路径。先上传图片（见功能三），用返回的 `wechat_url` 替换 HTML 中对应的 `<!-- IMG:N -->` 占位符。

**可用主题:**

| 主题 | 说明 |
|------|------|
| `autumn-warm` | 秋日暖光，橙色调，温暖治愈（默认） |
| `spring-fresh` | 春日清新，绿色调，清爽明快 |
| `ocean-calm` | 海洋静谧，蓝色调，沉稳专业 |
| `custom` | 使用 `--custom-prompt` 自定义提示词 |

```bash
# 使用自定义提示词
node "$SKILL_DIR/scripts/convert.mjs" -i article.md --custom-prompt "你的提示词"
```

---

## 功能二：风格写作（Dan Koe）

**触发条件：** 用户提到"用 Dan Koe 风格写"、"帮我写一篇文章"、"写一篇关于…的文章"

直接按以下规范生成文章，无需运行脚本。

### Dan Koe 核心写作 DNA

1. **身份优先于行动** — 你不是缺乏自律，而是你内心深处并不想要你嘴上说想要的东西
2. **所有行为都有目的** — 拖延不是懒，是你在保护自己免受某种恐惧
3. **改变从认知开始** — 看清问题本质，行动自然跟上
4. **反对盲目专精** — 在这个时代，多元兴趣是超能力，不是缺陷
5. **写作即思考** — 表达不清楚，说明还没想清楚

### 文章结构（6 部分）

**第一部分：钩子开场（前 150 字）**，选一种：

- **反向认同**：你大概率会放弃你的新年目标。没关系，大多数人都会…
- **自我揭露**：三年前，我每天工作 14 小时，却越来越穷…
- **反常识宣言**："自律"是这个时代最大的骗局之一…
- **直击痛点**：如果你也有过这种感觉——明明知道该做什么，就是做不到…

**第二部分：痛点共鸣** — 承认自己也有同样问题，描述失败经历，引出深层原因

**第三部分：价值承诺** — 分享 N 个核心认知，告知读者读完的收益

**第四部分：核心内容（3-7 个模块）**，每模块：
```
## 一、[标题：点出核心洞见]

> "名言或金句"
> ——出处

[大多数人的错误理解]

但真相是：[正确理解]

举个例子：[具体案例]

*所以关键不是[表面做法]，而是[深层原则]。*
```

**第五部分：金句提炼** — 至少 3-5 句可单独摘录的金句，用 *斜体* 标记

**第六部分：赋权结尾**，选一种：
- **行动指南**：建议一个可立即执行的具体小行动
- **思考问题**：留一个引发深度思考的问题
- **认知升级**：简洁重述核心信息，强调读者已获得的认知

### 格式规范

- 每段不超过 3 行，重要观点单独成段
- **粗体**：关键概念  |  *斜体*：核心金句  |  `「」`：特殊概念
- 句子用句号断句制造呼吸感，用破折号——制造停顿

### 语气要求

✅ 像朋友聊天，不像老师讲课
✅ 敢说大多数人不愿说的真话
✅ 承认自己的局限和失败
✅ 用具体例子支撑抽象观点
❌ 居高临下的说教感
❌ 空洞的励志口号（"加油！你可以的！"）
❌ 过度正能量

---

## 功能三：图片上传

### 上传本地图片

```bash
node "$SKILL_DIR/scripts/upload-image.mjs" /path/to/image.jpg
```

输出：
```json
{ "success": true, "media_id": "xxx", "wechat_url": "https://mmbiz..." }
```

### 下载在线图片并上传

```bash
node "$SKILL_DIR/scripts/download-upload.mjs" "https://example.com/image.png"
```

图片会自动压缩（超过 5MB 时）再上传。

---

## 功能四：创建图文草稿

**Step 1: 准备草稿 JSON 文件**（`draft.json`）

```json
{
  "articles": [{
    "title": "文章标题",
    "content": "<p>完整 HTML 内容（已替换图片 URL）</p>",
    "thumb_media_id": "封面图的素材 ID",
    "author": "作者名",
    "digest": "文章摘要，最多 120 字",
    "need_open_comment": 0,
    "only_fans_can_comment": 0
  }]
}
```

**Step 2: 创建草稿**

```bash
node "$SKILL_DIR/scripts/create-draft.mjs" draft.json
```

输出：
```json
{ "success": true, "media_id": "草稿的 media_id" }
```

---

## 功能五：创建小绿书（图片帖）

```bash
# 指定本地图片
node "$SKILL_DIR/scripts/create-image-post.mjs" \
  -t "标题" -c "描述文字" --images photo1.jpg,photo2.jpg

# 从 Markdown 文件提取图片
node "$SKILL_DIR/scripts/create-image-post.mjs" \
  -t "标题" -m article.md

# 预览（不实际创建）
node "$SKILL_DIR/scripts/create-image-post.mjs" \
  -t "标题" --images photo1.jpg --dry-run
```

输出：
```json
{ "success": true, "media_id": "xxx", "image_count": 2, "uploaded_ids": ["id1", "id2"] }
```

---

## 功能六：AI 去痕（Humanizer-zh）

**触发条件：** 用户提到"去除 AI 痕迹"、"让文章更自然"、"humanize"

直接按以下规范处理文本，无需运行脚本。

### 核心 5 条规则

1. **删除填充短语** — 去除开场白和强调性拐杖词
2. **打破公式结构** — 避免二元对比、戏剧性分段
3. **变化节奏** — 混合句子长度，两项优于三项
4. **信任读者** — 直接陈述，跳过软化和手把手引导
5. **删除金句** — 如果听起来像可引用的语句，重写它

### 22 种 AI 写作模式

**内容模式：**
1. 过度强调意义（标志着、见证了、是…的体现）
2. 过度强调知名度（反复引用媒体/专家但无具体来源）
3. 以 -ing 结尾的肤浅分析（突出/强调/确保…）
4. 宣传广告式语言（充满活力的、令人叹为观止的）
5. 模糊归因（行业报告显示、专家认为，无具体来源）
6. 公式化"挑战与未来展望"

**语言模式：**
7. 过度使用 AI 词汇（此外、至关重要、深入探讨、格局）
8. 避免使用"是"（作为/代表/标志着）
9. 否定式排比（不仅…而且…）
10. 三段式法则过度使用
11. 刻意换词（主人公→主要角色→中心人物→英雄）
12. 虚假范围（从 X 到 Y，但不在同一尺度）

**风格模式：**
13. 破折号过度使用
14. 粗体过度使用
15. 内联标题垂直列表（粗体标题+冒号的项目符号）
16. 表情符号装饰标题

**填充词：**
17. 填充短语（为了实现这一目标、在这个时间点）
18. 过度限定（可以潜在地可能被认为）
19. 通用积极结论（未来看起来光明、激动人心的时代）

**交流痕迹：**
20. 协作交流痕迹（希望这对您有帮助、当然！）
21. 知识截止日期免责声明
22. 谄媚卑躬屈膝的语气

### 处理后输出格式

```
# 人性化后的文本
[重写后的文本]

# 修改说明
[简要说明主要修改]

# 质量评分
| 维度 | 得分 | 说明 |
|------|------|------|
| 直接性 | x/10 | |
| 节奏 | x/10 | |
| 信任度 | x/10 | |
| 真实性 | x/10 | |
| 精炼度 | x/10 | |
| **总分** | **x/50** | |
```

---

## 配置

需要微信凭证才能使用上传/草稿功能（convert、写作、去痕无需凭证）。

**方式一：环境变量**

```bash
export WECHAT_APP_ID=your_appid
export WECHAT_SECRET=your_secret
```

**方式二：配置文件**（按优先级从高到低）

```
./wechat-studio.yaml                    # 项目本地（最高优先级）
~/.wechat-studio.yaml                   # 用户目录
~/.config/wechat-studio/config.yaml    # 全局配置
```

```yaml
wechat:
  appid: your_appid
  secret: your_secret

# 图片压缩选项（可选）
compress_images: true       # 是否自动压缩，默认 true
max_image_width: 1920       # 最大宽度（px），默认 1920
max_image_size: 5242880     # 最大文件大小（字节），默认 5MB
http_timeout: 30            # HTTP 超时（秒），默认 30
```

---

## 典型工作流

### 发布一篇 Markdown 文章

```bash
# 1. 生成排版 prompt
node "$SKILL_DIR/scripts/convert.mjs" -i article.md -t autumn-warm > prompt.json

# 2. [AI] 执行 prompt，得到 HTML

# 3. 上传文章中的图片（逐一上传，记录 media_id 和 wechat_url）
node "$SKILL_DIR/scripts/upload-image.mjs" images/photo.jpg

# 4. 将 HTML 中的 <!-- IMG:0 --> 替换为实际的 wechat_url

# 5. 上传封面图
node "$SKILL_DIR/scripts/upload-image.mjs" cover.jpg

# 6. 创建草稿（准备 draft.json，填入 HTML 和封面 media_id）
node "$SKILL_DIR/scripts/create-draft.mjs" draft.json
```

### 发布小绿书

```bash
node "$SKILL_DIR/scripts/create-image-post.mjs" \
  -t "九月摄影精选" -c "光影记录日常" \
  --images sep01.jpg,sep02.jpg,sep03.jpg
```

---

## File Structure

```
scripts/
  convert.mjs           # Markdown → 主题 AI prompt
  upload-image.mjs      # 上传本地图片到微信
  download-upload.mjs   # 下载在线图片并上传
  create-draft.mjs      # 创建图文草稿
  create-image-post.mjs # 创建小绿书

lib/
  args.mjs              # CLI 参数解析工具
  config.mjs            # 配置加载（env > YAML > 默认值）
  wechat.mjs            # 微信 API（token、上传、草稿）
  image.mjs             # 图片压缩（sharp）

themes/                 # 主题 YAML 文件
writers/                # 写作风格 YAML 文件
```
