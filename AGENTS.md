# AGENTS.md

本文件适用于整个仓库。

## 项目概况

MitRede 是一个基于 pnpm 的交互式演示文稿 Monorepo：

- `apps/web`：React 19 + Vite，包含管理端、编辑器、演示、预览和参与者界面。
- `apps/api`：NestJS REST API、Socket.IO 实时通信和 Prisma/PostgreSQL 数据持久化。
- `apps/worker`：基于 BullMQ 的后台任务 Worker。
- `packages/contracts`：共享的 Zod Schema、DTO 和实时事件类型。
- `packages/domain`：与框架无关的领域规则和状态机。
- `Codex`：产品需求和架构说明。

产品界面以德语为主。除非用户明确要求其他语言，否则界面中的可见文案保持德语。用户通常使用中文交流，因此实施结果和说明使用中文回复。

## 工作规则

- 保留工作区中已有及与当前任务无关的修改。不得为了简化任务而重置、还原或覆盖这些修改。
- 搜索代码和文件时使用 `rg` 和 `rg --files`。
- 使用能够完整解决需求的最小改动范围。
- 共享的请求、响应和 Socket.IO 数据结构统一定义在 `packages/contracts` 中，不得在前后端重复创建不兼容的类型。
- 需要在刷新或重新连接后保留的用户内容和实时会话状态必须持久化到 PostgreSQL，不得只依赖组件状态。
- 实时功能必须以同一份权威会话快照同步主持人端、投影端、预览端和参与者端。
- 预览模拟器和真实参与者界面是同一功能的两个独立使用端。修改交互功能时必须同时检查二者。
- 保持响应式布局。UI 修改需要检查桌面编辑器、投影视图以及窄屏手机参与者界面。
- 保持基本无障碍能力：使用语义化控件，支持键盘操作，提供标签、焦点状态以及有描述性的图标和二维码文本。
- 不得在源代码、日志、截图或回复中泄露密码、令牌、数据库连接字符串或其他敏感信息。
- 不要生成无用的多余的提示信息。

## 数据库修改

- 修改 `apps/api/prisma/schema.prisma` 时，必须在 `apps/api/prisma/migrations/` 下新增迁移；不得修改已经应用的迁移。
- 为已有演示文稿和会话选择向后兼容的默认值。
- 修改 Prisma Schema 后重新生成 Prisma Client。
- 除非用户明确要求，否则不得删除或重写生产数据。

## UI 规范

- 优先复用现有视觉语言和 CSS 变量，再考虑引入新的颜色或组件。
- 当页面内容可以被渲染时，编辑器缩略图应真实反映幻灯片内容，不要只显示通用的页面类型卡片。
- 只有在相关功能已经定义该行为时，设置值 `0` 才表示“不限制”。未配置限制时，不显示“无限制”计时器或提示卡片。
- 产品操作不得使用浏览器原生确认框。结束会话或执行破坏性操作时，应使用系统自有的确认对话框。
- 破坏性操作和多选操作必须清晰显示影响范围，并根据风险提供适当的确认步骤。

## 常用命令

使用仓库指定的 pnpm 版本以及 Node.js 22 或更高版本。

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

开发过程中优先运行与改动范围对应的检查：

```bash
pnpm --filter @mitrede/web build
pnpm --filter @mitrede/api typecheck
pnpm --filter @mitrede/api test
pnpm --filter @mitrede/domain test
pnpm db:generate
pnpm db:migrate
```

提交任务结果前：

1. 运行与改动最相关的类型检查、构建或测试。
2. 运行 `git diff --check`。
3. 对于跨层修改，需要一并验证共享类型、API、数据持久化、WebSocket 数据流以及所有受影响的界面。
4. 说明已完成的验证以及仍然存在的限制。未实际进行浏览器手动验证时，不得声称已经完成该验证。

## 开发服务

本地基础设施使用以下命令管理：

```bash
pnpm infra:up
pnpm infra:down
```

默认本地访问地址记录在 `README.md` 中。不得将当前部署主机硬编码到业务代码，应使用公共网址或域名配置。
