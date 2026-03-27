# 教训 #001：生成内容未自动展示

## 📅 元信息

- **发现日期：** 2026-03-11
- **项目：** 沃伦巴菲虾网站
- **问题类型：** 自动化缺失 / 验证不足
- **严重程度：** ⭐⭐⭐ 中（功能可用但体验受损）

---

## 🔍 问题描述

**现象：** 案例库已生成 3 个 HTML 页面，但主页只链接了 1 个，其他 2 个无法从主页访问。

**用户提问：**
> "网站上案例库里为什么只有华盛顿预报一个案例，其他案例为什么没有展示"

**实际状态：**
- ✅ 案例 HTML 文件已生成：3 个
- ❌ 主页链接已更新：1 个
- ❌ 完整性检查：无

---

## 🧠 根本原因分析

### 直接原因
生成脚本 `buffett-case-study.sh` 只负责生成 HTML 文件，不负责更新主页索引。

### 深层原因
1. **流程缺陷** - 没有"生成后自动更新索引"的环节
2. **缺乏验证** - 没有"完成后检查是否可访问"的机制
3. **手动维护** - 依赖人工记得更新链接，不可靠

### 思维盲区
> "生成 = 完成"的错误认知
> 
> 实际上：**生成 + 展示 + 验证 = 完成**

---

## 💡 解决方案

### 短期修复（已执行）
- ✅ 手动更新 `index.html` 添加缺失链接

### 长期预防（已执行）
1. **创建单一数据源** `cases.yaml`
   - 所有案例信息在一个地方定义
   - 状态管理（published/pending）
   
2. **创建检查脚本** `scripts/check-cases.sh`
   - 验证所有 published 案例都有链接
   - 验证所有链接都对应存在的文件
   
3. **创建更新脚本** `scripts/update-index.sh`
   - 根据配置自动生成主页链接
   
4. **集成到工作流**
   - 更新 `HEARTBEAT.md` 添加检查任务
   - 每次生成后自动运行检查

---

## 🎯 核心教训（可复用）

### 原则 1：自动化闭环
> **生成的内容必须自动出现在用户可见的地方**

❌ 错误：生成文件 → 人工记得更新索引  
✅ 正确：生成文件 → 自动更新索引 → 验证

### 原则 2：单一数据源
> **信息只在一个地方定义，其他都从它生成**

❌ 错误：案例列表在脚本里一份、主页里一份、导航里一份  
✅ 正确：案例列表只在 `cases.yaml`，其他从它生成

### 原则 3：验证即完成
> **没有验证的工作等于没完成**

❌ 错误：脚本跑完就认为完成了  
✅ 正确：脚本跑完 → 自动检查 → 输出报告 → 确认完成

---

## 🔄 可复用的模式

这个教训可以抽象为**通用工作流模式**：

```
定义配置 (YAML) → 生成内容 → 自动更新 → 完整性检查 → ✅ 完成
```

**适用场景：**
- ✅ 网站页面生成
- ✅ 文档站点构建
- ✅ 博客文章发布
- ✅ 任何需要"生成 + 展示"的场景

**通用工具：**
- `scripts/site-integrity-check.sh` - 通用完整性检查脚本
- `docs/site-config-example.yaml` - 配置模板
- `docs/site-workflow-template.md` - 工作流模板

---

## 📝 如何应用到未来项目

### 检查清单

当你开始一个新项目时，问自己：

- [ ] 是否有配置文件定义所有内容？（单一数据源）
- [ ] 生成内容后是否自动更新索引/导航？（自动化闭环）
- [ ] 是否有验证脚本检查完整性？（验证即完成）
- [ ] 是否将检查集成到日常流程？（HEARTBEAT 或 CI/CD）

### 快速启动

```bash
# 1. 复制通用框架
cp docs/site-config-example.yaml /path/to/project/site-config.yaml
cp scripts/site-integrity-check.sh /path/to/project/scripts/

# 2. 编辑配置文件
# 编辑 site-config.yaml 定义你的页面

# 3. 运行检查
./scripts/site-integrity-check.sh site-config.yaml .
```

---

## 📊 影响评估

### 如果不修复
- 用户无法访问已生成的内容
- 需要人工逐个检查链接
- 每次新增内容都可能重复此问题

### 修复后收益
- ✅ 自动生成和验证，零人工干预
- ✅ 问题即时发现，不会累积
- ✅ 可复用到未来所有类似项目

---

## 🔗 相关文件

- `/home/admin/.openclaw/workspace/cases.yaml` - 案例配置（单一数据源）
- `/home/admin/.openclaw/workspace/scripts/check-cases.sh` - 完整性检查
- `/home/admin/.openclaw/workspace/scripts/update-index.sh` - 自动更新
- `/home/admin/.openclaw/workspace/scripts/site-integrity-check.sh` - 通用框架
- `/home/admin/.openclaw/workspace/docs/site-config-example.yaml` - 配置模板
- `/home/admin/.openclaw/workspace/docs/site-workflow-template.md` - 工作流模板

---

## 🏷️ 标签

#自动化 #验证 #工作流 #网站 #可复用 #单一数据源

---

**记录者：** 程旭（老铁的 AI 助手）  
**审核状态：** ✅ 已完成  
**复用状态：** ✅ 已抽象为通用框架
