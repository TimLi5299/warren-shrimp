#!/bin/bash

# AI + FinTech 每日监控报告
# 用途：每天早晨自动生成社交媒体监控报告并推送到飞书
# 配置：每天 8:00 执行

set -e

WORKSPACE="/home/admin/.openclaw/workspace"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
REPORT_FILE="$WORKSPACE/social-media-monitor/report-$DATE.md"

echo "🤖 开始生成 AI + FinTech 监控报告..."
echo "时间：$TIMESTAMP"

# 创建报告目录
mkdir -p "$WORKSPACE/social-media-monitor"

# 搜索 AI 话题
echo "🔍 搜索 AI 话题..."
AI_OUTPUT=$(cd "$WORKSPACE" && uv run skills/searxng/scripts/searxng.py search "AI artificial intelligence trends 2026" -n 8 2>&1)

# 搜索 FinTech 话题
echo "🔍 搜索 FinTech 话题..."
FINTECH_OUTPUT=$(cd "$WORKSPACE" && uv run skills/searxng/scripts/searxng.py search "FinTech financial technology lending 2026" -n 8 2>&1)

# 搜索 AI Agent 话题
echo "🔍 搜索 AI Agent 话题..."
AGENT_OUTPUT=$(cd "$WORKSPACE" && uv run skills/searxng/scripts/searxng.py search "AI agent automation business" -n 8 2>&1)

# 提取热门结果（简化版）
AI_TOP=$(echo "$AI_OUTPUT" | grep -A2 "Top results:" | tail -1 | head -c 150 || echo "AI 趋势更新")
FINTECH_TOP=$(echo "$FINTECH_OUTPUT" | grep -A2 "Top results:" | tail -1 | head -c 150 || echo "FinTech 动态")

# 生成飞书消息
MESSAGE="📱 **AI + FinTech 每日监控报告**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 日期：$DATE
🔍 数据源：SearXNG

🤖 **AI 热点**
$AI_TOP

💰 **FinTech 热点**
$FINTECH_TOP

🎯 **今日重点**
• AI 应用落地加速
• 智能风控成标配
• 数字化转型深入

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*BotLearn, Human Earn.* 🤖"

# 推送到飞书
echo "📤 推送到飞书..."
cd "$WORKSPACE"
openclaw message send --target "ou_95aa8ba50098d1b100022eaf4a0893cf" --message "$MESSAGE"

echo "✅ 推送完成！"

# 保存完整报告（可选）
cat > "$REPORT_FILE" << EOF
# 📱 AI + FinTech 每日监控报告

**生成时间：** $TIMESTAMP
**数据来源：** SearXNG（隐私保护搜索引擎）

---

## 🤖 AI 搜索结果

\`\`\`
$AI_OUTPUT
\`\`\`

---

## 💰 FinTech 搜索结果

\`\`\`
$FINTECH_OUTPUT
\`\`\`

---

## 🤖 AI Agent 搜索结果

\`\`\`
$AGENT_OUTPUT
\`\`\`

---

*BotLearn, Human Earn.* 🤖
EOF

echo "✅ 完整报告已保存：$REPORT_FILE"
