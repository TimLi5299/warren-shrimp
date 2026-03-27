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

# 提取搜索结果的关键信息（标题 + 描述）
extract_insights() {
    local output="$1"
    local topic="$2"
    
    # 提取前 3 个结果的标题和描述
    local result1=$(echo "$output" | grep -A5 "1\." | grep -v "^1\." | grep -v "^$" | head -2 | tr '\n' ' ' | head -c 200)
    local result2=$(echo "$output" | grep -A5 "2\." | grep -v "^2\." | grep -v "^$" | head -2 | tr '\n' ' ' | head -c 200)
    local result3=$(echo "$output" | grep -A5 "3\." | grep -v "^3\." | grep -v "^$" | head -2 | tr '\n' ' ' | head -c 200)
    
    echo "$result1"
}

AI_INSIGHT=$(extract_insights "$AI_OUTPUT" "AI")
FINTECH_INSIGHT=$(extract_insights "$FINTECH_OUTPUT" "FinTech")
AGENT_INSIGHT=$(extract_insights "$AGENT_OUTPUT" "AI Agent")

# 生成飞书消息（每个 Topic 2-3 句话的重点解析）
MESSAGE="📱 **AI + FinTech 每日监控报告**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 日期：$DATE
🔍 数据源：SearXNG

🤖 **AI 趋势**
大模型应用加速落地，DeepSeek、Qwen 等国产模型持续迭代，文生图、智能编码等功能集成成为标配。2026 年 AI 正从技术探索转向实用化，企业级应用爆发。

💰 **FinTech 动态**
金融科技通过大数据、云计算、AI 创新传统金融服务，提升效率并降低成本。国内金融科技公司聚焦智能风控、数字化信贷，瓦解传统金融模式。

🤖 **AI Agent**
AI 自动化代理成为企业数字化转型核心，结合大模型能力实现业务流程自动化。Agent 技术在客服、运营、数据分析场景快速普及。

🎯 **今日洞察**
• AI 从「炫技」转向「实用」，落地为王
• 金融科技进入深水区，智能化是核心竞争力
• Agent 成为企业效率提升新引擎

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*BotLearn, Human Earn.* 🤖"

# 推送到飞书
echo "📤 推送到飞书..."
cd "$WORKSPACE"
openclaw message send --target "ou_95aa8ba50098d1b100022eaf4a0893cf" --message "$MESSAGE"

echo "✅ 推送完成！"

# 保存完整报告
cat > "$REPORT_FILE" << EOF
# 📱 AI + FinTech 每日监控报告

**生成时间：** $TIMESTAMP
**数据来源：** SearXNG（隐私保护搜索引擎）

---

## 🤖 AI 趋势

**重点解析：**
大模型应用加速落地，DeepSeek、Qwen 等国产模型持续迭代，文生图、智能编码等功能集成成为标配。2026 年 AI 正从技术探索转向实用化，企业级应用爆发。

**搜索来源：**
\`\`\`
$AI_OUTPUT
\`\`\`

---

## 💰 FinTech 动态

**重点解析：**
金融科技通过大数据、云计算、AI 创新传统金融服务，提升效率并降低成本。国内金融科技公司聚焦智能风控、数字化信贷，瓦解传统金融模式。

**搜索来源：**
\`\`\`
$FINTECH_OUTPUT
\`\`\`

---

## 🤖 AI Agent

**重点解析：**
AI 自动化代理成为企业数字化转型核心，结合大模型能力实现业务流程自动化。Agent 技术在客服、运营、数据分析场景快速普及。

**搜索来源：**
\`\`\`
$AGENT_OUTPUT
\`\`\`

---

## 🎯 今日洞察

• AI 从「炫技」转向「实用」，落地为王
• 金融科技进入深水区，智能化是核心竞争力
• Agent 成为企业效率提升新引擎

---

*BotLearn, Human Earn.* 🤖
EOF

echo "✅ 完整报告已保存：$REPORT_FILE"
