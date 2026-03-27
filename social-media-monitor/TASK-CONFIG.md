# 📱 AI + FinTech 每日监控报告

**任务名称：** AI-FinTech 每日监控  
**Cron ID：** `ec71c520-b0e9-4b54-adec-0ec03b6fa37e`  
**执行时间：** 每天早晨 8:00 (Asia/Shanghai)  
**创建日期：** 2026-03-10  
**状态：** ✅ 已启用

---

## ⏰ Cron 配置

```json
{
  "name": "AI-FinTech 每日监控",
  "cron": "0 8 * * *",
  "timezone": "Asia/Shanghai",
  "enabled": true,
  "nextRun": "2026-03-11 08:00:00"
}
```

---

## 🚀 执行流程

1. **8:00 AM** - Cron 触发
2. **8:00 AM** - 执行脚本 `/home/admin/.openclaw/workspace/scripts/daily-ai-fintech-monitor.sh`
3. **8:01 AM** - 搜索 AI、FinTech、AI Agent 话题
4. **8:02 AM** - 生成监控报告
5. **8:03 AM** - 推送到飞书

---

## 📊 监控话题

| 话题 | 搜索词 | 结果数 |
|------|--------|--------|
| AI 人工智能 | `AI artificial intelligence trends 2026` | Top 8 |
| FinTech | `FinTech financial technology lending 2026` | Top 8 |
| AI Agent | `AI agent automation business` | Top 8 |

---

## 📝 推送格式（每个 Topic 2-3 句话重点解析）

```
📱 AI + FinTech 每日监控报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 日期：YYYY-MM-DD
🔍 数据源：SearXNG

🤖 AI 趋势
[2-3 句话解析：大模型应用、技术方向、行业影响]

💰 FinTech 动态
[2-3 句话解析：技术创新、市场趋势、业务影响]

🤖 AI Agent
[2-3 句话解析：自动化应用、企业场景、落地进展]

🎯 今日洞察
• [核心观点 1]
• [核心观点 2]
• [核心观点 3]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*BotLearn, Human Earn.* 🤖
```

---

## 🔧 管理命令

### 查看任务列表
```bash
openclaw cron list
```

### 查看任务状态
```bash
openclaw cron status
```

### 手动运行测试
```bash
openclaw cron run "AI-FinTech 每日监控"
```

### 查看执行历史
```bash
openclaw cron runs
```

### 暂停任务
```bash
openclaw cron disable "AI-FinTech 每日监控"
```

### 启用任务
```bash
openclaw cron enable "AI-FinTech 每日监控"
```

### 删除任务
```bash
openclaw cron rm "AI-FinTech 每日监控"
```

---

## 📁 相关文件

| 文件 | 用途 |
|------|------|
| `scripts/daily-ai-fintech-monitor.sh` | 监控脚本 |
| `social-media-monitor/report-YYYY-MM-DD.md` | 每日报告 |
| `skills/social-media-monitor/SKILL.md` | 技能文档 |

---

## 🎯 自定义配置

### 修改推送时间
```bash
openclaw cron edit "AI-FinTech 每日监控" --cron "30 7 * * *"
# 改为每天 7:30
```

### 修改监控话题
编辑脚本 `scripts/daily-ai-fintech-monitor.sh` 中的搜索词

### 添加更多话题
```bash
# 在脚本中添加新的搜索
uv run skills/searxng/scripts/searxng.py search "新话题" -n 8
```

---

## 📊 执行历史

| 日期 | 状态 | 备注 |
|------|------|------|
| 2026-03-10 | ✅ 创建 | 任务配置完成 |
| 2026-03-11 | ⏳ 待执行 | 首次自动运行 |

---

## 💡 注意事项

1. **网络依赖** - 需要 SearXNG 服务正常运行
2. **推送渠道** - 默认推送到最后使用的飞书会话
3. **执行时间** - 约 2-3 分钟完成
4. **失败处理** - 任务失败会在下次 cron 周期重试

---

## 🔗 相关资源

- **BotLearn 第 5 步：** https://botlearn.ai/zh/quickstart/step5
- **OpenClaw Cron 文档：** https://docs.openclaw.ai/cli/cron
- **SearXNG 文档：** https://docs.searxng.org/

---

*BotLearn, Human Earn.* 🤖
