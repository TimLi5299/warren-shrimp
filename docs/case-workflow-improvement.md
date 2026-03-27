# 案例库工作流改进文档

## 问题背景

2026-03-11 发现问题：案例库已生成 3 个 HTML 页面（华盛顿邮报、中石油、BYD），但主页只链接了华盛顿邮报一个，其他两个案例无法从主页访问。

## 根本原因

1. **生成与展示脱节** - `buffett-case-study.sh` 只生成 HTML 文件，不更新主页索引
2. **缺乏验证环节** - 没有自动检查机制确认生成的内容是否正确展示
3. **手动维护易遗漏** - 依赖人工记得更新链接，不可靠

## 解决方案

### 1. 创建单一数据源 `cases.yaml`

所有案例信息统一在一个配置文件中管理：

```yaml
cases:
  - id: "03"
    name: "华盛顿邮报"
    file: "buffett-case-wapo.html"
    status: "published"  # 或 "pending"
```

**好处：**
- 案例信息只在一个地方定义
- 脚本从配置文件读取，避免多处维护
- 可以方便地查询哪些案例已发布、哪些待发布

### 2. 创建完整性检查脚本 `scripts/check-cases.sh`

每次生成新案例后运行，验证：
- 所有 `status: published` 的案例 HTML 文件是否存在
- 所有 `status: published` 的案例是否在 `index.html` 中有链接

**使用方法：**
```bash
./scripts/check-cases.sh
```

**输出示例：**
```
🦞 沃伦巴菲虾 - 案例完整性检查
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 检查 published 案例的链接状态...

  ✅ CASE #03 华盛顿邮报 文件：✅  链接：✅
  ✅ CASE #06 中国石油    文件：✅  链接：✅
  ✅ CASE #07 BYD 比亚迪   文件：✅  链接：✅

✅ 所有 published 案例都已正确链接！
```

### 3. 创建自动更新脚本 `scripts/update-index.sh`

根据 `cases.yaml` 自动生成 `index.html` 中的案例卡片和导航链接。

**使用方法：**
```bash
./scripts/update-index.sh
```

### 4. 更新 HEARTBEAT.md

添加案例完整性检查到每日任务清单，确保每次生成新案例后都会自动验证。

## 新工作流

```
1. 运行 buffett-case-study.sh 生成新案例
   ↓
2. 脚本自动更新 cases.yaml 中的 status 为 "published"
   ↓
3. 运行 update-index.sh 自动更新主页
   ↓
4. 运行 check-cases.sh 验证完整性
   ↓
5. ✅ 确认无误后完成
```

## 防止复发的保障措施

| 措施 | 说明 |
|------|------|
| 单一数据源 | 案例信息只在 `cases.yaml` 中定义 |
| 自动化更新 | 主页由脚本自动生成，不手动编辑 |
| 完整性检查 | 每次生成后自动验证链接 |
| 心跳检查 | HEARTBEAT.md 中包含检查任务 |

## 相关文件

- `/home/admin/.openclaw/workspace/cases.yaml` - 案例配置（单一数据源）
- `/home/admin/.openclaw/workspace/scripts/check-cases.sh` - 完整性检查脚本
- `/home/admin/.openclaw/workspace/scripts/update-index.sh` - 自动更新主页脚本
- `/home/admin/.openclaw/workspace/HEARTBEAT.md` - 心跳任务清单

## 教训总结

### 三条核心原则

1. **自动化闭环原则**
   > 生成的内容必须自动出现在用户可见的地方

2. **单一数据源原则**
   > 链接列表应该从一个地方生成，而不是多处手动维护

3. **验证即完成原则**
   > 没有验证的工作等于没完成

### 未来应用

这些原则应应用到其他类似场景：
- 生成新页面后自动更新导航
- 创建新功能后自动更新文档索引
- 添加新配置后自动验证配置有效性

---

**创建日期：** 2026-03-11
**创建者：** 程旭（老铁的 AI 助手）
