name: "Multi-Agent System: Research Agent with Email Draft Sub-Agent"
description: |

## Purpose
Build a Pydantic AI multi-agent system where a primary Research Agent uses Brave Search API and has an Email Draft Agent (using Gmail API) as a tool. This demonstrates agent-as-tool pattern with external API integrations.

## Core Principles
1. **Context is King**: Include ALL necessary documentation, examples, and caveats
2. **Validation Loops**: Provide executable tests/lints the AI can run and fix
3. **Information Dense**: Use keywords and patterns from the codebase
4. **Progressive Success**: Start simple, validate, then enhance

---

## Goal
Create a production-ready multi-agent system where users can research topics via CLI, and the Research Agent can delegate email drafting tasks to an Email Draft Agent. The system should support multiple LLM providers and handle API authentication securely.

## Why
- **Business value**: Automates research and email drafting workflows
- **Integration**: Demonstrates advanced Pydantic AI multi-agent patterns
- **Problems solved**: Reduces manual work for research-based email communications

## What
A CLI-based application where:
- Users input research queries
- Research Agent searches using Brave API
- Research Agent can invoke Email Draft Agent to create Gmail drafts
- Results stream back to the user in real-time

### Success Criteria
- [ ] Research Agent successfully searches via Brave API
- [ ] Email Agent creates Gmail drafts with proper authentication
- [ ] Research Agent can invoke Email Agent as a tool
- [ ] CLI provides streaming responses with tool visibility
- [ ] All tests pass and code meets quality standards

## All Needed Context

### Documentation & References
```yaml
# MUST READ - Include these in your context window
- url: https://ai.pydantic.dev/agents/
  why: Core agent creation patterns
  
- url: https://ai.pydantic.dev/multi-agent-applications/
  why: Multi-agent system patterns, especially agent-as-tool
  
- url: https://developers.google.com/gmail/api/guides/sending
  why: Gmail API authentication and draft creation
  
- url: https://api-dashboard.search.brave.com/app/documentation
  why: Brave Search API REST endpoints
  
- file: examples/agent/agent.py
  why: Pattern for agent creation, tool registration, dependencies
  
- file: examples/agent/providers.py
  why: Multi-provider LLM configuration pattern
  
- file: examples/cli.py
  why: CLI structure with streaming responses and tool visibility

- url: https://github.com/googleworkspace/python-samples/blob/main/gmail/snippet/send%20mail/create_draft.py
  why: Official Gmail draft creation example
```

### 当前代码库结构（Monorepo）
```bash
api-gateway-do-for-kv/                    # 根 Monorepo
├── pnpm-workspace.yaml                   # Workspace 配置
├── package.json                          # 根脚本（@gateway/monorepo）
├── apps/
│   ├── api/                             # @gateway/api - API 网关
│   │   ├── src/
│   │   │   ├── index.ts                 # 主应用入口
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── durable-objects/
│   │   │   ├── lib/
│   │   │   ├── schemas/
│   │   │   └── types/
│   │   ├── wrangler.toml                # Worker 配置
│   │   └── package.json                 # API 依赖
│   └── web/                             # @gateway/web - 管理后台
│       ├── src/                         # shadcn-admin 前端应用
│       ├── .env.development             # 开发环境变量
│       └── package.json                 # Web 依赖
├── PRPs/
│   └── templates/
│       └── prp_base.md
├── INITIAL.md
├── CLAUDE.md
└── requirements.txt
```

### 目标代码库结构（新增多代理示例项目）
```bash
api-gateway-do-for-kv/                    # 根 Monorepo
├── apps/
│   ├── multi-agent-example/             # 新多代理示例项目
│   │   ├── agents/
│   │   │   ├── __init__.py               # 包初始化
│   │   │   ├── research_agent.py         # 使用 Brave Search 的主代理
│   │   │   ├── email_agent.py           # 具备 Gmail 功能的子代理
│   │   │   ├── providers.py             # LLM 提供商配置
│   │   │   └── models.py                # Pydantic 数据验证模型
│   │   ├── tools/
│   │   │   ├── __init__.py              # 包初始化
│   │   │   ├── brave_search.py          # Brave Search API 集成
│   │   │   └── gmail_tool.py            # Gmail API 集成
│   │   ├── config/
│   │   │   ├── __init__.py              # 包初始化
│   │   │   └── settings.py              # 环境和配置管理
│   │   ├── tests/
│   │   │   ├── __init__.py              # 包初始化
│   │   │   ├── test_research_agent.py   # 研究代理测试
│   │   │   ├── test_email_agent.py      # 邮件代理测试
│   │   │   ├── test_brave_search.py     # Brave 搜索工具测试
│   │   │   ├── test_gmail_tool.py       # Gmail 工具测试
│   │   │   └── test_cli.py              # CLI 测试
│   │   ├── cli.py                       # CLI 接口
│   │   ├── .env.example                 # 环境变量模板
│   │   ├── requirements.txt             # 更新的依赖
│   │   ├── README.md                    # 综合文档
│   │   ├── package.json                 # Python 项目也可以有 package.json 用于脚本
│   │   └── credentials/.gitkeep         # Gmail 凭据目录
│   ├── api/                             # 现有 API 网关
│   └── web/                             # 现有管理后台
└── ...
```

### Known Gotchas & Library Quirks
```python
# 重要：Pydantic AI 需要全程异步 - 异步上下文中不使用同步函数
# 重要：Gmail API 在首次运行时需要 OAuth2 流程 - 需要 credentials.json
# 重要：Brave API 有速率限制 - 免费层每月 2000 请求
# 重要：代理作为工具模式需要传递 ctx.usage 进行令牌跟踪
# 重要：Gmail 草稿需要正确 MIME 格式的 base64 编码
# 重要：始终使用绝对导入以确保代码清晰
# 重要：在 .env 中存储敏感凭据，绝不提交到版本控制
```

## Implementation Blueprint

### Data models and structure

```python
# models.py - Core data structures
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class ResearchQuery(BaseModel):
    query: str = Field(..., description="Research topic to investigate")
    max_results: int = Field(10, ge=1, le=50)
    include_summary: bool = Field(True)

class BraveSearchResult(BaseModel):
    title: str
    url: str
    description: str
    score: float = Field(0.0, ge=0.0, le=1.0)

class EmailDraft(BaseModel):
    to: List[str] = Field(..., min_items=1)
    subject: str = Field(..., min_length=1)
    body: str = Field(..., min_length=1)
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None

class ResearchEmailRequest(BaseModel):
    research_query: str
    email_context: str = Field(..., description="Context for email generation")
    recipient_email: str
```

### List of tasks to be completed

```yaml
任务1：设置配置和环境
创建 config/settings.py：
  - 模式：使用 pydantic-settings 像示例中使用 os.getenv
  - 加载带默认值的环境变量
  - 验证所需 API 密钥存在

创建 .env.example：
  - 包含所有必需环境变量及其描述
  - 遵循 examples/README.md 的模式

任务2：实现 Brave Search 工具
创建 tools/brave_search.py：
  - 模式：像 examples/agent/tools.py 一样的异步函数
  - 使用 httpx 的简单 REST 客户端（已在 requirements 中）
  - 优雅处理速率限制和错误
  - 返回结构化的 BraveSearchResult 模型

任务3：实现 Gmail 工具
创建 tools/gmail_tool.py：
  - 模式：遵循 Gmail 快速开始的 OAuth2 流程
  - 在 credentials/ 目录中存储 token.json
  - 使用正确的 MIME 编码创建草稿
  - 自动处理认证刷新

任务4：创建邮件草稿代理
创建 agents/email_agent.py：
  - 模式：遵循 examples/agent/agent.py 结构
  - 使用 Agent 与 deps_type 模式
  - 将 gmail_tool 注册为 @agent.tool
  - 返回 EmailDraft 模型

任务5：创建研究代理
创建 agents/research_agent.py：
  - 模式：来自 Pydantic AI 文档的多代理模式
  - 注册 brave_search 作为工具
  - 注册 email_agent.run() 作为工具
  - 使用 RunContext 进行依赖注入

任务6：实现 CLI 接口
创建 cli.py：
  - 模式：遵循 examples/cli.py 流式模式
  - 带工具可见性的彩色输出
  - 使用 asyncio.run() 正确处理异步
  - 对话上下文的会话管理

任务7：添加综合测试
创建 tests/：
  - 模式：镜像 examples 测试结构
  - 模拟外部 API 调用
  - 测试正常路径、边缘情况、错误
  - 确保 80%+ 覆盖率

任务8：创建文档
创建 README.md：
  - 模式：遵循 examples/README.md 结构
  - 包含设置、安装、使用
  - API 密钥配置步骤
  - 架构图
```

### Per task pseudocode

```python
# 任务2：Brave Search 工具
async def search_brave(query: str, api_key: str, count: int = 10) -> List[BraveSearchResult]:
    # 模式：像示例使用 aiohttp 一样使用 httpx
    async with httpx.AsyncClient() as client:
        headers = {"X-Subscription-Token": api_key}
        params = {"q": query, "count": count}
        
        # 注意：Brave API 在 API 密钥无效时返回 401
        response = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            headers=headers,
            params=params,
            timeout=30.0  # 重要：设置超时以避免挂起
        )
        
        # 模式：结构化错误处理
        if response.status_code != 200:
            raise BraveAPIError(f"API 返回状态码 {response.status_code}")
        
        # 使用 Pydantic 解析和验证
        data = response.json()
        return [BraveSearchResult(**result) for result in data.get("web", {}).get("results", [])]

# 任务5：将邮件代理作为工具的研究代理
@research_agent.tool
async def create_email_draft(
    ctx: RunContext[AgentDependencies],
    recipient: str,
    subject: str,
    context: str
) -> str:
    """基于研究上下文创建邮件草稿。"""
    # 重要：传递 usage 进行令牌跟踪
    result = await email_agent.run(
        f"创建一封发送给 {recipient} 关于：{context} 的邮件",
        deps=EmailAgentDeps(subject=subject),
        usage=ctx.usage  # 来自多代理文档的模式
    )
    
    return f"草稿已创建，ID：{result.data}"
```

### Integration Points
```yaml
ENVIRONMENT:
  - add to: .env
  - vars: |
      # LLM 配置
      LLM_PROVIDER=openai
      LLM_API_KEY=sk-...
      LLM_MODEL=gpt-4
      
      # Brave 搜索
      BRAVE_API_KEY=BSA...
      
      # Gmail（credentials.json 路径）
      GMAIL_CREDENTIALS_PATH=./credentials/credentials.json
      
配置：
  - Gmail OAuth：首次运行时打开浏览器进行授权
  - 令牌存储：./credentials/token.json（自动创建）
  
依赖项：
  - 更新 requirements.txt 添加：
    - google-api-python-client
    - google-auth-httplib2
    - google-auth-oauthlib
```

## Validation Loop

### 第1级：语法和样式
```bash
# 首先运行这些 - 在继续之前修复任何错误
ruff check . --fix              # 自动修复样式问题
mypy .                          # 类型检查

# 预期：无错误。如有错误，阅读并修复。
```

### 第2级：单元测试
```python
# test_research_agent.py
async def test_research_with_brave():
    """测试研究代理正确搜索"""
    agent = create_research_agent()
    result = await agent.run("AI 安全研究")
    assert result.data
    assert len(result.data) > 0

async def test_research_creates_email():
    """测试研究代理能调用邮件代理"""
    agent = create_research_agent()
    result = await agent.run(
        "研究 AI 安全并起草邮件发送给 john@example.com"
    )
    assert "draft_id" in result.data

# test_email_agent.py  
def test_gmail_authentication(monkeypatch):
    """测试 Gmail OAuth 流程处理"""
    monkeypatch.setenv("GMAIL_CREDENTIALS_PATH", "test_creds.json")
    tool = GmailTool()
    assert tool.service is not None

async def test_create_draft():
    """测试使用正确编码创建草稿"""
    agent = create_email_agent()
    result = await agent.run(
        "创建发送给 test@example.com 关于 AI 研究的邮件"
    )
    assert result.data.get("draft_id")
```

```bash
# 迭代运行测试直到通过：
pytest tests/ -v --cov=agents --cov=tools --cov-report=term-missing

# 如果失败：调试特定测试，修复代码，重新运行
```

### 第3级：集成测试
```bash
# 测试 CLI 交互
python cli.py

# 预期交互：
# 用户：研究最新的 AI 安全发展
# 🤖 助手：[流式输出研究结果]
# 🛠 使用的工具：
#   1. brave_search (query='AI 安全发展', limit=10)
#
# 用户：为此创建发送给 john@example.com 的邮件草稿
# 🤖 助手：[创建草稿]
# 🛠 使用的工具：
#   1. create_email_draft (recipient='john@example.com', ...)

# 检查 Gmail 草稿文件夹中的已创建草稿
```

## 最终验证清单
- [ ] 所有测试通过：`pytest tests/ -v`
- [ ] 无代码规范错误：`ruff check .`
- [ ] 无类型错误：`mypy .`
- [ ] Gmail OAuth 流程正常工作（浏览器打开，令牌保存）
- [ ] Brave Search 返回结果
- [ ] 研究代理成功调用邮件代理
- [ ] CLI 流式响应且工具可见
- [ ] 错误情况得到优雅处理
- [ ] README 包含清晰的设置说明
- [ ] .env.example 包含所有必需变量

---

## 需避免的反模式
- ❌ 不要硬编码 API 密钥 - 使用环境变量
- ❌ 不要在异步代理上下文中使用同步函数
- ❌ 不要跳过 Gmail 的 OAuth 流程设置
- ❌ 不要忽略 API 的速率限制
- ❌ 不要忘记在多代理调用中传递 ctx.usage
- ❌ 不要提交 credentials.json 或 token.json 文件

## 信心评分：9/10

高信心源于：
- 代码库中有清晰的示例可供遵循
- 外部 API 文档完善
- 多代理系统已有成熟模式
- 完整的验证机制

在 Gmail OAuth 首次设置用户体验方面存在轻微不确定性，但文档提供了清晰指导。