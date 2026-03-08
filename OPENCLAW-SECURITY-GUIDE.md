# 🔐 OpenClaw 安全审查指南

**版本：** 1.0  
**更新日期：** 2026-03-08  
**适用对象：** OpenClaw 管理员、安全审计人员

---

## 📋 目录

1. [安全审查工具](#1-安全审查工具)
2. [手动安全检查清单](#2-手动安全检查清单)
3. [敏感信息排查](#3-敏感信息排查)
4. [权限与访问控制](#4-权限与访问控制)
5. [网络安全配置](#5-网络安全配置)
6. [定期审计流程](#6-定期审计流程)

---

## 1. 安全审查工具

### 1.1 OpenClaw 内置命令

```bash
# 安全审计（快速）
openclaw security audit

# 深度安全审计（推荐）
openclaw security audit --deep

# 输出 JSON 格式（便于自动化）
openclaw security audit --json

# 自动修复安全问题
openclaw security audit --fix

# 检查更新状态
openclaw update status

# 查看 Gateway 状态
openclaw status

# 深度状态检查
openclaw status --deep

# 健康检查（JSON 输出）
openclaw health --json
```

### 1.2 安装/修复 OpenClaw CLI

如果 `openclaw` 命令不可用：

```bash
# 通过 pnpm 安装
pnpm install -g openclaw

# 或通过 npm 安装
npm install -g openclaw

# 验证安装
openclaw --version
```

### 1.3 第三方安全工具

| 工具 | 用途 | 命令示例 |
|------|------|----------|
| **truffleHog** | 检测提交历史中的密钥 | `trufflehog git file://. --since-commit HEAD --branch main` |
| **gitleaks** | Git 仓库密钥扫描 | `gitleaks detect --source . --verbose` |
| **pre-commit** | 提交前检查钩子 | `pre-commit run --all-files` |
| **semgrep** | 代码安全扫描 | `semgrep --config auto .` |
| **nmap** | 端口扫描 | `nmap -sV -p- localhost` |

---

## 2. 手动安全检查清单

### 2.1 敏感文件检查

```bash
# 检查 workspace 中的敏感文件
cd /home/admin/.openclaw/workspace

# 查找可能的密钥文件
find . -name "*.key" -o -name "*.pem" -o -name "*.crt" -o -name ".env*"

# 查找包含敏感关键词的文件
grep -r "password\|secret\|token\|api_key\|ghp_" --include="*.md" --include="*.txt" --include="*.json" . 2>/dev/null

# 检查 .gitignore 是否完整
cat .gitignore
```

### 2.2 Git 历史检查

```bash
# 检查是否有敏感信息被提交过
git log --all --full-history -- "**/*.key" "**/.env" "**/*secret*"

# 查看最近的提交
git log --oneline -20

# 检查是否有大文件（可能包含敏感数据）
git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | awk '/^blob/ { if ($3 > 1000000) print $3, $4 }' | sort -n
```

### 2.3 凭证存储检查

```bash
# 检查 OpenClaw 凭证目录
ls -la /home/admin/.openclaw/credentials/

# 检查凭证文件权限（应该是 600 或更严格）
find /home/admin/.openclaw/credentials/ -type f -exec ls -la {} \;

# 检查是否有明文凭证
grep -r "password\|token\|key" /home/admin/.openclaw/credentials/ 2>/dev/null | head -20
```

### 2.4 配置文件检查

```bash
# 检查 OpenClaw 主配置
cat /home/admin/.openclaw/openclaw.json | python3 -m json.tool

# 重点检查：
# - gateway.bindAddress（不应绑定到 0.0.0.0）
# - 是否有硬编码的凭证
# - 日志级别是否合适
```

### 2.5 权限检查

```bash
# 检查 OpenClaw 目录权限
ls -la /home/admin/.openclaw/

# 检查关键目录权限（应该是 700 或 755）
ls -lad /home/admin/.openclaw/credentials
ls -lad /home/admin/.openclaw/logs
ls -lad /home/admin/.openclaw/memory

# 检查 workspace 文件权限
find /home/admin/.openclaw/workspace/ -type f -perm /o+w 2>/dev/null
```

---

## 3. 敏感信息排查

### 3.1 常见敏感信息模式

```bash
# GitHub Token
grep -rE "ghp_[a-zA-Z0-9]{36}" . 2>/dev/null

# NPM Token
grep -rE "//registry.npmjs.org/:_authToken=[a-zA-Z0-9-]+" . 2>/dev/null

# AWS Key
grep -rE "AKIA[0-9A-Z]{16}" . 2>/dev/null

# 通用 API Key
grep -rE "api[_-]?key[\"']?\s*[:=]\s*[\"'][a-zA-Z0-9]{20,}[\"']" . 2>/dev/null

# 私钥文件
find . -name "id_rsa" -o -name "id_ed25519" -o -name "*.pem" 2>/dev/null
```

### 3.2 记忆文件检查

```bash
# 检查记忆文件中是否有敏感信息
grep -E "token|password|secret|key" /home/admin/.openclaw/workspace/memory/*.md 2>/dev/null

# 检查 MEMORY.md
grep -E "token|password|secret|key" /home/admin/.openclaw/workspace/MEMORY.md 2>/dev/null
```

### 3.3 如果发现敏感信息

**立即行动：**

1. **不要删除文件**（需要审计追踪）
2. **立即轮换密钥**（GitHub Token、API Key 等）
3. **从 Git 历史中移除**（使用 `git filter-branch` 或 `BFG Repo-Cleaner`）
4. **更新 .gitignore**
5. **记录事件**（创建安全事件报告）

**从 Git 历史移除敏感文件：**

```bash
# 方法 1：使用 git filter-branch
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch path/to/sensitive/file' \
  --prune-empty --tag-name-filter cat -- --all

# 方法 2：使用 BFG（更快）
bfg --delete-files path/to/sensitive/file

# 强制推送（谨慎！）
git push --force --all
```

---

## 4. 权限与访问控制

### 4.1 OpenClaw 权限模型

```bash
# 检查扩展权限
ls -la /home/admin/.openclaw/extensions/

# 检查技能权限
ls -la /home/admin/.openclaw/workspace/skills/

# 检查浏览器控制权限
cat /home/admin/.openclaw/browser/config.json 2>/dev/null
```

### 4.2 飞书集成安全

```bash
# 检查飞书配置
cat /home/admin/.openclaw/feishu/config.json 2>/dev/null

# 检查飞书凭证
ls -la /home/admin/.openclaw/feishu/credentials/ 2>/dev/null

# 检查 Webhook 配置
cat /home/admin/.openclaw/workspace/.feishu_webhook 2>/dev/null
# 应该显示：cat: ...: No such file or directory（如果已正确忽略）
```

### 4.3 浏览器控制安全

如果启用了浏览器控制：

```bash
# 检查浏览器配置
cat /home/admin/.openclaw/browser/config.json

# 检查是否有不受信任的扩展
ls -la /home/admin/.openclaw/browser/extensions/
```

**安全建议：**
- ✅ 为所有重要账户启用 2FA
- ✅ 优先使用硬件密钥（YubiKey）
- ⚠️ SMS 验证不够安全
- ❌ 不要在浏览器中保存敏感密码

---

## 5. 网络安全配置

### 5.1 检查监听端口

```bash
# Linux
ss -ltnup | grep -E "openclaw|node|npm"

# 或
lsof -nP -iTCP -sTCP:LISTEN | grep -E "openclaw|node"

# 检查 Gateway 绑定地址
# 安全：127.0.0.1 或局域网 IP
# 危险：0.0.0.0（公开监听）
```

### 5.2 防火墙状态

```bash
# Linux (UFW)
ufw status

# Linux (firewalld)
firewall-cmd --state
firewall-cmd --list-all

# Linux (nftables)
nft list ruleset

# macOS
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
```

### 5.3 网络暴露检查

```bash
# 检查是否有公网 IP
curl -s https://api.ipify.org

# 检查端口是否对外暴露
# （从外部机器执行）
nmap -p 8080,3000,4000 <your-server-ip>
```

---

## 6. 定期审计流程

### 6.1 每日检查（自动化）

```bash
# 添加到 crontab（每天 8:00）
0 8 * * * /home/admin/.local/share/pnpm/global/5/node_modules/.bin/openclaw security audit --json >> /var/log/openclaw-security-audit.log 2>&1
```

### 6.2 每周检查（手动）

**每周安全审查清单：**

- [ ] 审查安全审计日志
- [ ] 检查是否有新的敏感文件
- [ ] 验证 Git 提交记录
- [ ] 检查凭证文件权限
- [ ] 审查访问日志（如有）

### 6.3 每月检查（深度）

**每月深度审查：**

- [ ] 完整的安全审计（`openclaw security audit --deep`）
- [ ] Git 历史扫描（truffleHog/gitleaks）
- [ ] 端口扫描（nmap）
- [ ] 权限审查（所有 OpenClaw 目录）
- [ ] 更新 OpenClaw 到最新版本
- [ ] 审查和更新 .gitignore
- [ ] 备份凭证和配置

### 6.4 事件响应流程

**发现安全事件时：**

1. **立即隔离**
   - 停止 OpenClaw Gateway
   - 断开网络连接（如必要）

2. **评估影响**
   - 什么数据被泄露？
   - 哪些凭证需要轮换？
   - 是否有未授权访问？

3. **修复**
   - 轮换所有可能泄露的凭证
   - 修复漏洞
   - 更新安全配置

4. **记录**
   - 创建安全事件报告
   - 记录时间线、影响、修复措施
   - 更新安全流程

5. **恢复**
   - 重新启动服务
   - 持续监控
   - 定期审查

---

## 📎 附录 A：快速检查脚本

```bash
#!/bin/bash
# openclaw-security-quick-check.sh

echo "🔐 OpenClaw 快速安全检查"
echo "=========================="

# 1. 检查敏感文件
echo -e "\n📁 检查敏感文件..."
find /home/admin/.openclaw/workspace -name "*.key" -o -name "*.pem" -o -name ".env*" 2>/dev/null

# 2. 检查 Git 历史中的敏感信息
echo -e "\n🔍 检查 Git 历史..."
cd /home/admin/.openclaw/workspace
git log --all --oneline | head -10

# 3. 检查凭证权限
echo -e "\n🔑 检查凭证权限..."
ls -la /home/admin/.openclaw/credentials/ 2>/dev/null

# 4. 检查监听端口
echo -e "\n🌐 检查监听端口..."
ss -ltnup 2>/dev/null | grep -E "node|npm|openclaw" || echo "未发现 OpenClaw 相关端口"

# 5. 检查 .gitignore
echo -e "\n📝 检查 .gitignore..."
cat /home/admin/.openclaw/workspace/.gitignore 2>/dev/null | head -20

echo -e "\n✅ 快速检查完成"
```

---

## 📎 附录 B：安全事件报告模板

```markdown
# 安全事件报告

**事件 ID：** SEC-YYYY-MM-DD-001  
**发现时间：** YYYY-MM-DD HH:MM  
**报告人：** [姓名]

## 事件概述
[简要描述安全事件]

## 影响范围
- [ ] 凭证泄露
- [ ] 未授权访问
- [ ] 数据泄露
- [ ] 其他：____

## 时间线
- HH:MM - 事件发生
- HH:MM - 事件发现
- HH:MM - 开始响应
- HH:MM - 事件 containment
- HH:MM - 修复完成

## 根本原因
[详细描述]

## 修复措施
1. [措施 1]
2. [措施 2]
3. [措施 3]

## 预防改进
1. [改进 1]
2. [改进 2]

## 后续行动
- [ ] 轮换凭证
- [ ] 更新文档
- [ ] 团队培训
- [ ] 其他：____
```

---

## 📚 参考资源

- [OpenClaw 官方文档](https://docs.openclaw.ai)
- [OpenClaw 安全最佳实践](https://docs.openclaw.ai/security)
- [GitHub Secret Scanning](https://docs.github.com/code-security/secret-scanning)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

**最后更新：** 2026-03-08  
**下次审查：** 2026-04-08

*安全是一个持续的过程，不是一次性的任务。* 🔒
