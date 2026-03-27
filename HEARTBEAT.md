# HEARTBEAT.md - 沃伦巴菲虾自动化系统

# 注意：日常自动化已通过 cron 实现（每晚 20:00）
# 此文件用于 heartbeat 触发的额外检查

---

## 🤖 自动化系统状态

### 每日报告系统 v2.0
- **脚本：** `scripts/daily-report.sh`
- **时间：** 每天 20:00 自动执行
- **流程：** 案例学习 → 网站更新 → 完整性检查 → 飞书推送
- **配置：** `cron/jobs.crontab`

### Cron 任务
```bash
# 安装 cron：crontab /home/admin/.openclaw/workspace/cron/jobs.crontab
# 查看状态：crontab -l
# 日志位置：/home/admin/.openclaw/workspace/logs/
```

---

## 📋 Heartbeat 检查项

### 每周检查（周一早晨）
- [ ] 查看上周日志：`tail -50 logs/daily-report.log`
- [ ] 确认 cron 正常运行：`crontab -l`
- [ ] 检查网站可访问性

### 每月检查（1 号）
- [ ] 清理旧日志（自动）
- [ ] 回顾月度案例学习进度
- [ ] 更新 MEMORY.md 月度总结

---

## 🆘 故障处理

### 如果某天没收到日报
1. 检查日志：`tail -100 logs/daily-report.log`
2. 手动运行：`./scripts/daily-report.sh`
3. 检查 cron：`crontab -l` 和 `systemctl status cron`

### 如果网站链接有问题
1. 运行检查：`./scripts/check-cases.sh`
2. 自动修复：`./scripts/update-index.sh`
3. 重新生成：`./scripts/daily-report.sh`
