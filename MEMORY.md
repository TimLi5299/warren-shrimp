# Long-Term Memory

## Preferences

### Search
- **Default search tool:** searxng skill (privacy-respecting local metasearch)
- When any web search is needed, prioritize the searxng skill over web_search (Brave API)
- SearXNG instance: configured via `SEARXNG_URL` env var (default: `http://localhost:8080`)

## Notes

- Memory file created: 2026-02-28
- User prefers privacy-focused search tools

## Learning & Growth

### 经验教训沉淀机制（2026-03-11 建立）

**核心原则：**
1. 每次交付结果与预期不一致时，必须记录教训
2. 教训要抽象为可复用的模式和工具
3. 新项目启动时，必须回顾相关教训

**知识库位置：** `docs/lessons-learned/`

**已记录教训：**
- #001: 生成内容未自动展示（自动化闭环 + 单一数据源 + 验证即完成）

**通用工具：**
- `scripts/site-integrity-check.sh` - 网站完整性检查
- `docs/site-config-example.yaml` - 配置模板
- `docs/site-workflow-template.md` - 工作流模板

## Feishu Integration

- **No webhook needed** - OpenClaw has built-in Feishu integration via `message` tool
- Use `message send --channel feishu` for direct messaging
- Don't create webhook configs or curl-based sending
