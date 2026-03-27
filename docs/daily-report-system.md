# 沃伦巴菲虾 - 每日报告自动化系统 v2.0

## 📋 系统概述

这是一个完全自动化的每日报告系统，用于：
1. 📚 每天学习一个巴菲特投资案例
2. 🌐 自动更新网站内容和链接
3. ✅ 自动进行完整性检查
4. 📤 自动发送飞书日报给老铁

---

## 🚀 快速开始

### 1. 安装 Cron 任务

```bash
# 安装定时任务
crontab /home/admin/.openclaw/workspace/cron/jobs.crontab

# 验证安装
crontab -l
```

### 2. 手动测试

```bash
# 运行完整流程
cd /home/admin/.openclaw/workspace
./scripts/daily-report.sh

# 查看日志
tail -f logs/daily-report.log
```

---

## 📁 文件结构

```
/home/admin/.openclaw/workspace/
├── scripts/
│   ├── daily-report.sh          # 主脚本（一键完成所有事情）
│   ├── buffett-case-study.sh    # 案例学习脚本
│   ├── update-index.sh          # 更新主页索引
│   └── check-cases.sh           # 完整性检查
├── cron/
│   └── jobs.crontab             # Cron 任务配置
├── logs/
│   └── daily-report.log         # 运行日志
├── daily-reports/
│   └── report-YYYY-MM-DD.txt    # 每日报告存档
├── cases.yaml                   # 案例配置（单一数据源）
└── index.html                   # 网站主页
```

---

## ⏰ 定时任务

| 时间 | 任务 | 说明 |
|------|------|------|
| 每天 20:00 | 每日报告 | 案例学习 + 网站更新 + 飞书推送 |
| 每周日 02:00 | 完整性检查 | 确保周末更新正常 |
| 每月 1 号 03:00 | 日志清理 | 删除 30 天前的旧日志 |

---

## 📊 每日报告内容

```
━━━━━━━━━━━━━━━━━━━━
🦜 沃伦巴菲虾 · 日报
2026 年 03 月 12 日 星期四
━━━━━━━━━━━━━━━━━━━━

📚 今日案例
• CASE #09 - 美国银行 (2011)
• 案例编号：Day 8

🛠️ OpenClaw 工具进度
• 自动化流程：每日报告系统 v2.0
• 状态：✅ 正常运行

🌐 网站状态
• Published 案例：5 个
• 完整性检查：✅ 通过

━━━━━━━━━━━━━━━━━━━━
💡 今日金句
"别人恐惧时我贪婪，别人贪婪时我恐惧"
━━━━━━━━━━━━━━━━━━━━

📊 详细报告：https://lobster-resume.github.io
━━━━━━━━━━━━━━━━━━━━
```

---

## 🔧 故障处理

### 问题 1：没收到日报

```bash
# 1. 检查日志
tail -100 logs/daily-report.log

# 2. 检查 cron 状态
crontab -l
systemctl status cron

# 3. 手动运行测试
./scripts/daily-report.sh
```

### 问题 2：网站链接缺失

```bash
# 1. 运行完整性检查
./scripts/check-cases.sh

# 2. 自动修复
./scripts/update-index.sh

# 3. 重新生成报告
./scripts/daily-report.sh
```

### 问题 3：飞书推送失败

检查 `.pending-feishu-msg.txt` 文件，手动发送内容。

---

## 📝 自定义配置

### 修改发送时间

编辑 `cron/jobs.crontab`：
```bash
# 改为每天 19:00 发送
0 19 * * * cd $WORKSPACE && ./scripts/daily-report.sh
```

### 修改报告格式

编辑 `scripts/daily-report.sh` 中的报告模板部分。

### 添加新的检查项

在 `scripts/daily-report.sh` 的"步骤 3：完整性检查"后添加新步骤。

---

## 🎯 核心原则

1. **自动化闭环** - 生成的内容自动出现在用户可见的地方
2. **单一数据源** - 所有案例信息只在 `cases.yaml` 定义
3. **验证即完成** - 没有验证的工作等于没完成
4. **错误可恢复** - 出问题时自动通知，支持手动修复

---

## 📚 相关文档

- [教训 #001：生成内容未自动展示](../docs/lessons-learned/001-case-library-links-missing.md)
- [案例配置示例](../docs/site-config-example.yaml)
- [工作流模板](../docs/site-workflow-template.md)

---

**版本：** v2.0  
**创建日期：** 2026-03-12  
**维护者：** 程旭（老铁的 AI 助手）
