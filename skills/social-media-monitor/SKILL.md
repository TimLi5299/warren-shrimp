# 📱 社交媒体监控套件 (SearXNG 版)

**版本：** 1.0  
**作者：** 老铁 + 程旭  
**创建日期：** 2026-03-10  
**依赖：** SearXNG (本地部署)

---

## 🎯 功能概述

基于 SearXNG 搜索引擎的社交媒体监控工具，支持：
- **Reddit** - 监控热帖和关键词提及
- **YouTube** - 搜索视频和频道
- **Twitter/X** - 搜索推文和话题

**优势：**
- ✅ 无需 API Keys
- ✅ 隐私保护（本地 SearXNG）
- ✅ 支持多平台同时搜索
- ✅ 立即可用

**限制：**
- ⚠️ 只能搜索公开内容
- ⚠️ 无法获取评论情绪分析
- ⚠️ 无法登录获取个性化内容

---

## 📦 安装

技能已内置，无需额外安装。

**前置条件：**
1. SearXNG 已配置（`SEARXNG_URL` 环境变量）
2. 默认：`http://localhost:8080`

---

## 🚀 使用方法

### 1. Reddit 监控

```
监控 Reddit 上 [话题] 的热帖
```

**示例：**
```
监控 Reddit 上 artificial intelligence 过去 24 小时热帖
监控 Reddit 上 fintech 本周热门讨论
```

**输出格式：**
- 帖子标题
-  subreddit
- 热度（点赞数）
- 链接

---

### 2. YouTube 搜索

```
搜索 YouTube 上 [话题] 的最新视频
```

**示例：**
```
搜索 YouTube 上 AI agent 的最新教程视频
搜索 YouTube 上 金融科技 分析报告
```

**输出格式：**
- 视频标题
- 频道名称
- 发布时间
- 观看次数
- 链接

---

### 3. Twitter/X 监控

```
搜索 Twitter 上 [话题] 的热门推文
```

**示例：**
```
搜索 Twitter 上 #AI 的热门话题
搜索 Twitter 上 Elon Musk 的最新推文
```

**输出格式：**
- 推文内容
- 作者
- 发布时间
- 点赞/转发数
- 链接

---

### 4. 综合监控报告

```
生成社交媒体监控报告 - [话题]
```

**示例：**
```
生成社交媒体监控报告 - 人工智能
生成社交媒体监控报告 - 加密货币
```

**输出格式：**
- Reddit 热门讨论（Top 5）
- YouTube 相关视频（Top 5）
- Twitter 热门话题（Top 5）
- 趋势分析摘要

---

## 🔧 技术实现

### SearXNG 搜索类别

| 平台 | SearXNG 类别 | 搜索示例 |
|------|-------------|---------|
| Reddit | `reddit` | `site:reddit.com [topic]` |
| YouTube | `youtube` | `site:youtube.com [topic]` |
| Twitter | `twitter` | `site:twitter.com [topic]` |

### 搜索参数

```python
# 时间范围
- day: 过去 24 小时
- week: 过去 7 天
- month: 过去 30 天
- year: 过去一年

# 排序
- relevance: 相关度
- date: 时间倒序
- popularity: 热度
```

---

## 📊 示例输出

### Reddit 监控示例

```
📱 Reddit 监控报告 - artificial intelligence
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 时间范围：过去 24 小时
🔍 搜索词：artificial intelligence

🔥 Top 5 热帖:

1. [r/MachineLearning] D: GPT-5 传闻讨论
   👍 2.3k | 💬 456 评论
   🔗 https://reddit.com/r/MachineLearning/...

2. [r/artificial] AI Agent 框架对比
   👍 1.8k | 💬 234 评论
   🔗 https://reddit.com/r/artificial/...

3. [r/technology] 最新 AI 监管政策
   👍 1.5k | 💬 189 评论
   🔗 https://reddit.com/r/technology/...

... (共 5 条)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🎯 使用场景

### 1. 行业趋势监控
- 每天早晨生成 AI/FinTech 领域热点
- 发现新兴话题和技术趋势

### 2. 竞品分析
- 监控竞品在社交媒体的声量
- 分析用户反馈和评价

### 3. 危机预警
- 及时发现负面讨论
- 快速响应公关事件

### 4. 内容灵感
- 发现热门话题和讨论角度
- 为内容创作提供素材

---

## ⚙️ 配置选项

### 自定义监控话题

编辑配置文件（可选）：
```json
{
  "topics": ["AI", "FinTech", "Crypto"],
  "frequency": "daily",
  "platforms": ["reddit", "youtube", "twitter"],
  "results_per_platform": 10
}
```

### 定时任务

```bash
# 每天早 8 点生成监控报告
0 8 * * * curl http://localhost:18650/agent -d '{"message": "生成社交媒体监控报告 - AI FinTech"}'
```

---

## 📝 运行历史

| 日期 | 话题 | 平台 | 结果数 | 备注 |
|------|------|------|--------|------|
| 2026-03-10 | AI, FinTech | Reddit, YouTube, Twitter | - | 首次运行 |

---

## 🔗 参考资源

- **SearXNG 文档:** https://docs.searxng.org/
- **BotLearn 第 5 步:** https://botlearn.ai/zh/quickstart/step5
- **原始 Skill 参考:**
  - https://github.com/buksan1950/reddit-readonly
  - https://github.com/therohitdas/youtube-full
  - https://github.com/psmamm/social-media-agent

---

**BotLearn, Human Earn.** 🤖
