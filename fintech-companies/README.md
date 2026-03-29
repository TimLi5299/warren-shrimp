# Fintech 企业分析系统

**定位：** 每天深度分析一家金融科技公司，为老铁的借贷业务提供洞察和参考

**启动日期：** 2026-03-31（周二）

---

## 🤖 自动化配置

### Cron 任务
- **执行时间：** 每个工作日早晨 8:00（周一 - 周五）
- **Cron 表达式：** `0 8 * * 1-5`
- **脚本：** `scripts/daily-fintech-company.sh`
- **日志：** `logs/fintech-daily.log`

### 安装命令
```bash
# 添加到 crontab
(crontab -l 2>/dev/null; echo "0 8 * * 1-5 cd /home/admin/.openclaw/workspace && ./scripts/daily-fintech-company.sh >> /home/admin/.openclaw/workspace/logs/fintech-daily.log 2>&1") | crontab -

# 查看状态
crontab -l

# 查看日志
tail -50 /home/admin/.openclaw/workspace/logs/fintech-daily.log
```

---

## 📋 企业列表

**总数：** 15 家（10 家国内 + 5 家国际）

**分析顺序：**
1. 蚂蚁集团（Ant Group）
2. 京东科技（JD Technology）
3. 度小满（Du Xiaoman）
4. 陆金所（Lufax）
5. 360 数科（360 DigiTech）
6. 乐信（Lexin）
7. 宜人金科（Yiren Digital）
8. 拍拍贷（PPDAI）
9. 信也科技（FinVolution）
10. 奇富科技（Qifu Technology）
11. Stripe
12. Square/Block
13. PayPal
14. Affirm
15. Klarna

**循环机制：** 分析完 15 家后从头开始，每轮深化分析维度

---

## 📊 分析框架

每家企业分析包含 7 个维度：

1. **公司概况** - 成立时间、总部、创始人、估值
2. **核心业务** - 主要产品、目标客户、收入模式
3. **技术创新** - 技术壁垒、AI/大数据应用、专利
4. **市场地位** - 市场份额、竞争对手、优劣势
5. **财务表现** - 营收、利润、增长趋势
6. **风险挑战** - 监管、竞争、技术风险
7. **老铁洞察** - 对借贷行业的启示、可借鉴经验、需警惕教训

---

## 📁 文件结构

```
fintech-companies/
├── COMPANIES.yaml          # 企业列表配置
├── README.md               # 本文档
├── .state.json             # 执行状态（当前索引）
├── report-YYYY-MM-DD.md    # 每日分析报告
└── profiles/               # 企业深度档案（逐步积累）
    ├── ant-group.md
    ├── jd-technology.md
    └── ...
```

---

## 📤 推送格式

**飞书私信：** 每日早晨 8:00 自动推送

```
🏦 Fintech 企业日报 | [企业名称]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 日期：YYYY-MM-DD
📊 序号：Day X / 15

🔍 核心业务
[1 句话概括]

📈 市场地位
[行业地位描述]

💡 关键洞察
• [核心观点 1]
• [核心观点 2]
• [核心观点 3]

📝 完整报告已保存
查看：[文件路径]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*BotLearn, Human Earn.* 🤖
```

---

## 🔧 管理命令

### 手动运行测试
```bash
cd /home/admin/.openclaw/workspace
./scripts/daily-fintech-company.sh
```

### 查看当前进度
```bash
cat fintech-companies/.state.json
```

### 重置进度（从头开始）
```bash
echo '{"current_index": 0, "last_run": null}' > fintech-companies/.state.json
```

### 查看历史报告
```bash
ls -lt fintech-companies/report-*.md | head -10
```

### 查看日志
```bash
tail -100 logs/fintech-daily.log
```

---

## 🎯 使用建议

### 给老铁的建议
1. **每天花 5 分钟** 阅读早报，了解一家企业
2. **重点关注** "老铁洞察" 部分，思考如何应用到我们的业务
3. **遇到感兴趣的** 企业，可以让我深入分析（财务数据、商业模式等）
4. **定期回顾** 每月做一次总结，提炼共性规律

### 后续优化方向
- [ ] 添加财务数据可视化
- [ ] 增加竞品对比分析
- [ ] 接入实时新闻监控
- [ ] 生成月度/季度汇总报告
- [ ] 建立企业档案知识库（Bitable）

---

## 📊 执行记录

| 日期 | 企业 | 状态 | 备注 |
|------|------|------|------|
| 2026-03-31 | 蚂蚁集团 | ⏳ 待执行 | 系统启动 |

---

*BotLearn, Human Earn.* 🤖
