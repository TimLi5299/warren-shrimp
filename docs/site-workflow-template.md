# 网站工作流模板 - 可复用的完整性保障

## 适用场景

当你创建**任何新网站**时，都可以套用这个工作流来防止"页面生成了但访问不到"的问题。

---

## 快速开始

### 1️⃣ 复制框架文件

```bash
# 复制通用脚本
cp /home/admin/.openclaw/workspace/scripts/site-integrity-check.sh /path/to/your/project/scripts/

# 复制配置示例
cp /home/admin/.openclaw/workspace/docs/site-config-example.yaml /path/to/your/project/site-config.yaml
```

### 2️⃣ 编辑配置文件

根据你的网站修改 `site-config.yaml`：

```yaml
pages:
  - id: "001"
    name: "首页"
    file: "index.html"
    status: "published"
  
  - id: "002"
    name: "你的页面"
    file: "your-page.html"
    status: "published"
```

### 3️⃣ 运行检查

```bash
cd /path/to/your/project
./scripts/site-integrity-check.sh site-config.yaml .
```

---

## 工作流图

```
创建新页面
    ↓
添加到 site-config.yaml (status: published)
    ↓
运行 site-integrity-check.sh 验证
    ↓
✅ 通过 → 部署
❌ 失败 → 修复 → 重新检查
```

---

## 核心原则（适用于任何项目）

| 原则 | 说明 | 如何应用 |
|------|------|---------|
| **单一数据源** | 页面信息只在一个地方定义 | 创建 `site-config.yaml` |
| **自动化验证** | 不依赖人工检查 | 运行 `site-integrity-check.sh` |
| **状态管理** | 明确页面状态（published/pending/draft） | 在配置中标注 status |

---

## 项目示例

### 示例 1：沃伦巴菲虾网站

```yaml
# cases.yaml
cases:
  - id: "03"
    name: "华盛顿邮报"
    file: "buffett-case-wapo.html"
    status: "published"
```

### 示例 2：公司官网

```yaml
# site-config.yaml
pages:
  - id: "home"
    name: "首页"
    file: "index.html"
    status: "published"
  
  - id: "products"
    name: "产品中心"
    file: "products.html"
    status: "published"
  
  - id: "blog"
    name: "博客"
    file: "blog.html"
    status: "pending"
```

### 示例 3：个人博客

```yaml
# posts.yaml
posts:
  - id: "001"
    name: "第一篇文章"
    file: "posts/hello-world.html"
    status: "published"
  
  - id: "002"
    name: "第二篇文章"
    file: "posts/second-post.html"
    status: "draft"
```

---

## 集成到 CI/CD（可选）

如果你有自动化部署流程，可以在部署前自动检查：

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    steps:
      - name: 检查网站完整性
        run: ./scripts/site-integrity-check.sh site-config.yaml .
      
      - name: 部署
        run: ./deploy.sh
```

---

## 常见问题

### Q: 可以检查外部链接吗？
A: 当前版本只检查本地文件。如需检查外部链接，可以扩展脚本添加 `curl` 或 `wget` 检查。

### Q: 支持其他格式吗（如 JSON）？
A: 当前支持 YAML。如需 JSON，可以创建 `site-config.json` 并修改脚本的解析逻辑。

### Q: 如何检查页面内的链接？
A: 可以扩展脚本，使用 `grep` 或 `pup` 等工具解析 HTML 中的 `<a>` 标签。

---

## 总结

这个模板的核心价值不是脚本本身，而是**工作流思维**：

1. **定义** - 明确有哪些页面（配置文件）
2. **验证** - 自动检查是否都能访问（检查脚本）
3. **状态** - 区分已发布和待发布（status 字段）

**套用这个思维，任何网站都能避免"生成了但看不到"的问题！**

---

**模板版本：** 1.0
**创建日期：** 2026-03-11
**基于：** 沃伦巴菲虾项目经验教训
