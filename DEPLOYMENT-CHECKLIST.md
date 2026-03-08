# 📦 沃伦巴菲虾 - 部署检查清单

**重要：** 每次推送前必须完成此检查清单，避免部署失败！

---

## 🚨 推送前检查（必须 100% 完成）

### 1. 检查嵌套 Git 仓库 ❌ **历史问题 #2**
```bash
# 执行命令
find . -name ".git" -type d

# ✅ 期望输出（只有根目录的 .git）
./.git

# ❌ 如果发现其他 .git 目录，立即删除
rm -rf website/.git  # 示例
```

### 2. 检查敏感信息 ❌ **历史问题 #1**
```bash
# 检查暂存区
git diff --cached

# 搜索常见敏感信息
git diff --cached | grep -E "ghp_|sk_|password|secret|token"

# ✅ 确保没有：
# - GitHub Token (ghp_*)
# - API 密钥
# - 密码
# - 私钥
```

### 3. 检查入口文件 ❌ **历史问题 #4**
```bash
# 确认 index.html 存在
ls -la index.html

# ✅ 期望：文件存在且大小合理（> 1KB）
# ❌ 如果不存在，创建或复制
cp warren-shrimp-timeline.html index.html
```

### 4. 检查分支 ❌ **历史问题 #3**
```bash
# 查看当前分支
git branch

# ✅ 必须在 main 分支
# ❌ 如果在其他分支，切换
git checkout main
```

### 5. 检查文件完整性
```bash
# 查看将要提交的文件
git status

# 确认关键文件存在
ls -la index.html buffett-case-wapo.html warren-shrimp-timeline.html
```

---

## 🚀 推送步骤

```bash
# 1. 添加所有更改
git add -A

# 2. 提交（写清楚变更内容）
git commit -m "描述清楚的变更内容"

# 3. 推送到 main 分支
git push origin main

# 4. 查看推送结果
# ✅ 成功：看到 "main -> main"
# ❌ 失败：查看错误信息
```

---

## ✅ 推送后验证（5 分钟内完成）

### 1. 检查 Actions 构建状态
访问：https://github.com/TimLi5299/warren-shrimp/actions

- ✅ 最新构建状态应为 **success**（绿色）
- ❌ 如果是 **failure**（红色），点击查看详情

### 2. 验证主页可访问
```bash
# 检查 HTTP 状态码
curl -sI https://timli5299.github.io/warren-shrimp/

# ✅ 期望：HTTP/2 200
# ❌ 如果是 404，检查 index.html
```

### 3. 验证子页面可访问
```bash
# 检查华盛顿邮报案例
curl -sI https://timli5299.github.io/warren-shrimp/buffett-case-wapo.html

# ✅ 期望：HTTP/2 200
```

### 4. 验证内容更新
```bash
# 检查页面是否包含最新内容
curl -s https://timli5299.github.io/warren-shrimp/ | grep "最新变更关键词"

# ✅ 期望：能找到关键词
# ❌ 如果找不到，可能是缓存问题，等待 1-2 分钟
```

### 5. 浏览器硬刷新测试
- **Mac:** `Cmd + Shift + R`
- **Windows:** `Ctrl + Shift + R`
- **手机：** 关闭页面重新打开

---

## 🔧 故障排查

### 问题：Pages 构建失败

**步骤 1：** 查看构建日志
```
https://github.com/TimLi5299/warren-shrimp/actions
```

**步骤 2：** 常见错误及解决

| 错误 | 原因 | 解决 |
|------|------|------|
| Checkout failed | 嵌套 git 仓库 | `rm -rf ./.git/modules/*` |
| No index.html | 缺少入口文件 | 创建或复制 index.html |
| 404 Not Found | 分支不匹配 | 确认推送到 main |

### 问题：页面显示旧版本

**原因：** CDN 缓存未刷新

**解决：**
1. 等待 1-3 分钟
2. 浏览器硬刷新
3. 添加版本号强制刷新：`index.html?v=20260308`

### 问题：推送被拒绝

**原因：** 可能包含敏感信息

**解决：**
1. 查看错误信息中的具体原因
2. 移除敏感信息
3. 如已提交，重写历史或重新初始化

---

## 📞 快速链接

| 资源 | 链接 |
|------|------|
| GitHub 仓库 | https://github.com/TimLi5299/warren-shrimp |
| Actions 构建 | https://github.com/TimLi5299/warren-shrimp/actions |
| GitHub Pages | https://timli5299.github.io/warren-shrimp/ |
| 问题审查报告 | `POSTMORTEM-2026-03-08.md` |

---

## 📝 检查清单模板（复制使用）

```markdown
## 部署检查 - YYYY-MM-DD

- [ ] 检查嵌套 git 仓库
- [ ] 检查敏感信息
- [ ] 检查 index.html
- [ ] 确认在 main 分支
- [ ] git add -A
- [ ] git commit -m "描述"
- [ ] git push origin main
- [ ] 检查 Actions 状态
- [ ] 验证主页可访问
- [ ] 验证子页面可访问
- [ ] 浏览器硬刷新测试
```

---

**最后更新：** 2026-03-08  
**基于教训：** POSTMORTEM-2026-03-08

*记住：90% 的部署问题可以通过此检查清单避免！* ✅
