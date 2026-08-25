# 技术选型决策：AI 开发优先

## 1. 决策状态

- 状态：已接受
- 决策日期：2026-08-25
- 适用范围：所内互动演示平台的首版与后续演进
- 核心前提：项目主要通过 AI 完成设计、编码、测试和持续修改，不考虑团队已有语言或框架经验。

## 2. 最终决策

采用 TypeScript 单语言的模块化单体架构：

| 层级 | 技术选择 |
|---|---|
| 前端 | React + TypeScript + Vite |
| 后端 | NestJS |
| HTTP API | REST + OpenAPI |
| 实时通信 | Socket.IO |
| 数据库 | PostgreSQL |
| ORM与迁移 | Prisma |
| 队列 | BullMQ |
| 缓存与广播 | Redis |
| 文件存储 | MinIO或其他 S3 兼容对象存储 |
| PDF浏览器预览 | PDF.js |
| PDF后台渲染 | MuPDF或 Poppler，运行在受限 Worker 中 |
| AI能力 | NestJS 中的统一模型适配层，通过 BullMQ 异步调用 |
| 自动化测试 | Vitest/Jest、Playwright、k6 |
| 部署 | Docker Compose + Nginx |
| 代码组织 | pnpm workspace 单仓库 |

不在首版引入微服务、Kubernetes、事件溯源、原生 App 或 Python 服务。只有在出现明确的高级 OCR、复杂自然语言处理或本地模型推理需求后，才考虑增加独立 Python Worker。

## 3. 决策目标

“由 AI 开发”不会消除软件复杂度，只会改变最重要的工程约束。选型优先满足：

1. 尽可能少的语言与运行时。
2. 编译器能够发现接口和类型不一致。
3. 框架提供强约定，减少 AI 自由发挥造成的架构漂移。
4. 前端、后端、实时事件和 Worker 可以共享契约。
5. 依赖成熟、文档明确、测试工具完整。
6. 现场故障容易定位，核心播放链路可以降级。
7. 自托管简单，数据保存在所内可控环境。

## 4. 为什么选择 TypeScript 单语言体系

### 4.1 减少跨语言接口漂移

React、NestJS、Socket.IO 和 BullMQ 都使用 TypeScript。一次题型变更可以在同一代码库中同步修改：

- 后端请求和响应模型。
- 前端编辑表单。
- 参与端答案类型。
- 实时事件结构。
- Worker 任务参数。
- 测试 Fixture。

跨语言方案通常还需要维护 Python/C# 模型与 TypeScript 模型之间的映射。AI 能够生成这些映射，但也更容易遗漏字段、空值语义和枚举变化。

### 4.2 编译期与运行时双重校验

- TypeScript 严格模式提供编译期校验。
- REST API 通过 OpenAPI 生成前端客户端。
- Socket.IO 事件和 BullMQ 任务使用共享运行时 Schema 校验。
- 进入数据库前再次执行领域规则校验。

TypeScript 类型在运行时会消失，因此不能只依赖接口声明。所有来自浏览器、队列、WebSocket 和 AI 的数据都必须经过运行时验证。

### 4.3 框架约束架构

NestJS 的模块、Controller、Service、Guard、Interceptor 和 Gateway 形成明确的代码位置。AI 修改代码时必须遵守模块边界，降低以下风险：

- Controller直接操作数据库。
- WebSocket和HTTP各自实现一套权限逻辑。
- 循环依赖。
- 房间状态散落在进程内变量。
- 重型任务阻塞 API 事件循环。

## 5. 系统结构

```text
浏览器
├── 编辑端
├── 主持端
└── 参与端
       │
       ├── REST / OpenAPI
       └── Socket.IO
              │
           NestJS API
           ├── PostgreSQL / Prisma
           ├── Redis
           ├── Socket.IO Adapter
           ├── MinIO
           └── BullMQ
                 ├── PDF Worker
                 ├── AI Worker
                 └── Export Worker
```

### 5.1 单仓库目录

```text
apps/
├── web/                 React 编辑端、主持端和参与端
├── api/                 NestJS REST API 与 Socket.IO Gateway
└── worker/              BullMQ Worker

packages/
├── contracts/           DTO、事件和任务 Schema
├── domain/              状态机、权限和聚合规则
├── ui/                  公共 UI 组件
├── api-client/          OpenAPI 生成客户端
└── config/              TypeScript、Lint、测试公共配置

infra/
├── docker/
└── nginx/
```

首版使用 pnpm workspace 即可，不额外引入复杂的仓库编排系统。只有构建时间或包数量显著增加后，再评估 Turborepo 或 Nx。

## 6. 前端决策

选择 React + Vite，而不是 Next.js：

- 系统是登录后的互动 Web 应用，不依赖搜索引擎优化。
- 主持页和参与页都是长生命周期客户端状态。
- 实时连接由独立 NestJS 服务管理。
- Vite 构建结果可以直接由 Nginx 托管。
- 不将长连接、后台任务和文件处理塞进全栈前端框架。

前端分为三种路由入口，但共用题型组件和契约：

```text
/app                    管理与编辑
/present/:sessionId     主持与投屏
/join/:roomCode         手机参与
```

服务端数据使用查询缓存管理，本地编辑草稿和实时房间状态分别保存。Socket.IO 事件统一进入房间 Store，组件不得自行修改公共房间状态。

## 7. 后端决策

NestJS 作为模块化单体，主要模块为：

- `identity`：登录、角色和统一认证适配。
- `presentations`：演示、节点、修订和权限。
- `assets`：上传、PDF资产和页面图。
- `sessions`：场次、房间码、状态机和主持控制权。
- `interactions`：题型、答案、聚合与审核。
- `realtime`：Socket.IO 鉴权、房间和事件发布。
- `jobs`：BullMQ任务生产和状态查询。
- `ai`：模型适配、提示模板和发布审核。
- `exports`：CSV与会后报告。
- `admin`：配置、清理和审计。

必须遵守：

```text
Controller / Gateway
        ↓
Application Service
        ↓
Domain Rule
        ↓
Repository / External Adapter
```

Controller 和 Gateway 不得直接访问 Prisma。HTTP 命令和 Socket.IO 命令调用同一 Application Service，避免产生两套业务规则。

## 8. REST 与实时通信边界

### 8.1 REST负责

- 登录与权限查询。
- 演示 CRUD。
- PDF 上传和处理状态。
- 节点编辑和排序。
- 创建或结束场次。
- 主持命令。
- 答案提交。
- 最新状态快照。
- 历史结果、导出和 AI 任务创建。

答案和主持命令通过 REST 提交，便于幂等、鉴权、审计、限流和错误重试。

### 8.2 Socket.IO负责

- 当前演示节点变化。
- 互动开放或锁定。
- 结果可见性变化。
- 聚合结果变化。
- 在线状态近似变化。
- PDF、AI和导出任务进度。

Socket.IO 事件是状态变化通知，不是唯一事实来源。权威状态始终在 PostgreSQL 中。

### 8.3 房间协议

每个公共事件必须包含：

```json
{
  "eventId": "...",
  "sessionId": "...",
  "stateVersion": 42,
  "occurredAt": "...",
  "type": "session.state_changed",
  "payload": {}
}
```

规则：

1. `stateVersion` 由服务端在数据库事务中递增。
2. 客户端丢弃旧版本事件。
3. 客户端发现版本缺口时重新调用快照接口。
4. Socket.IO 连接恢复成功也不能跳过版本校验。
5. 关键提交使用幂等请求 ID 和数据库唯一约束。

## 9. Socket.IO 与 Redis

### 9.1 单实例

试用阶段可以使用 Socket.IO 内置适配器。Redis 仍用于 BullMQ，但不把房间权威状态保存在 Redis 中。

### 9.2 多实例

多个 NestJS API 实例之间采用 Socket.IO Redis Streams Adapter。它用于：

- 跨实例房间广播。
- Redis短暂断线后继续消费流。
- 配合 Socket.IO连接状态恢复。

负载均衡仍需正确配置长连接和会话路由。无论使用何种 Adapter，客户端都必须支持完整状态快照恢复。

### 9.3 Redis安全

- Redis 只允许内网服务访问。
- 启用认证与最小权限。
- 不在实时事件中传输长期凭据。
- Redis故障不能破坏 PostgreSQL 中的最终数据。
- PDF静态播放不得依赖 Redis 持续可用。

## 10. 数据库与 Prisma

PostgreSQL是以下数据的事实来源：

- 用户、演示和权限。
- 演示修订与节点快照。
- 演示场次和当前状态。
- 匿名参与会话。
- 答案与审核结果。
- AI草稿与发布版本。
- 审计记录和任务元数据。

Prisma负责大部分类型安全查询和迁移，但以下场景允许并鼓励使用事务或原生 SQL：

- 房间状态版本原子递增。
- 主持控制权竞争。
- 锁题和提交答案之间的竞争。
- 幂等 Upsert。
- 高效批量聚合。
- 数据清理和归档。

数据库必须设置唯一约束，而不是只依赖应用代码防止重复答案。

## 11. Worker 与 BullMQ

独立 Worker 处理：

- PDF校验、解析和渲染。
- 文本提取和可选 OCR。
- AI总结和题目推荐。
- CSV或报告导出。
- 过期数据清理。

任务必须包含可重试策略、超时、幂等键、进度、失败原因和清理逻辑。CPU密集 PDF 工具在独立容器或子进程中运行，并设置 CPU、内存、临时磁盘、执行时间和网络权限限制。

API进程只负责创建任务和查询状态，不直接执行 PDF 渲染或 AI 推理。

## 12. PDF方案

```text
上传临时文件
→ 校验文件签名、大小和页数
→ 写入MinIO
→ 创建BullMQ任务
→ Worker调用MuPDF/Poppler
→ 生成缩略图和高清页面图
→ 可选提取文本
→ 上传输出文件
→ 更新资产状态
→ Socket.IO通知前端
```

主持播放默认使用后台生成的页面图，以保证浏览器显示一致；PDF.js用于编辑器高清预览和页面图失败时的降级。

## 13. AI方案

AI模块使用供应商无关接口：

```text
summarize(input, mode, policy)
suggestQuestions(pdfText, context)
```

要求：

- 通过BullMQ异步执行。
- 可切换所内模型或允许的外部模型。
- 只发送任务需要的最小数据。
- 已隐藏回答不得进入模型上下文。
- 输出先保存为主持人草稿。
- 主持人确认后才公开。
- AI失败不影响播放、答题和历史结果。

首版不增加 Python 服务。只有出现 TypeScript 生态难以满足的本地模型、OCR 或NLP需求，才增加边界明确的 Python Worker，并通过队列任务契约通信。

## 14. 部署

```text
Docker Compose
├── nginx
├── web
├── api
├── worker
├── postgres
├── redis
└── minio
```

- Nginx提供 HTTPS、静态资源、API反向代理和 Socket.IO长连接代理。
- API与Worker使用相同源码仓库和共享契约，但运行在独立进程或容器。
- Worker设置资源限制，避免 PDF任务影响现场API。
- PostgreSQL、MinIO纳入备份和恢复演练。
- 首版不使用 Kubernetes。

## 15. AI开发约束

这些规则是技术方案的一部分，不是可选的代码风格：

1. TypeScript开启严格模式。
2. 禁止无理由使用 `any`、非空断言和跳过校验。
3. 外部输入必须经过运行时 Schema。
4. REST 客户端由 OpenAPI 生成，禁止手写重复接口类型。
5. 实时事件和队列任务来自 `packages/contracts`。
6. Controller与Gateway禁止直接调用 Prisma。
7. 数据库变更必须包含迁移文件和回滚/兼容性说明。
8. 状态机每一个合法与非法转换都要有测试。
9. 修复缺陷时必须先增加能够复现问题的测试。
10. AI修改后必须实际运行类型检查、Lint和相关测试。
11. 依赖版本固定在锁文件中，升级单独提交并执行回归测试。
12. 禁止根据模型记忆猜测第三方 API；以项目锁定版本的文档和类型定义为准。

## 16. 测试门禁

每次合并至少执行：

```text
类型检查
Lint
单元测试
API集成测试
数据库迁移测试
关键Playwright端到端测试
```

发布候选版本还必须执行：

- 100与300参与者集中提交压测。
- Socket.IO断线、重连和快照恢复测试。
- Redis短暂不可用测试。
- API和Worker重启测试。
- 异常PDF和资源限制测试。
- AI关闭、超时和错误输出测试。

## 17. 被否决的主要替代方案

### FastAPI

优点是 Python PDF/AI生态直接、API轻量、WebSocket可用。未作为首选的原因是前后端跨语言，需要额外维护 TypeScript与Python契约，实时房间、任务和管理约束需要更多自行组合。若未来引入 Python Worker，不改变主后端选型。

### Django + Channels

用户、权限和管理后台能力强，但实时与异步结构比当前方案更复杂，且项目核心是实时互动而不是后台CRUD。

### ASP.NET Core + SignalR

SignalR的实时能力最完整，但会形成 React/TypeScript与C#双语言体系，PDF与高级AI任务仍可能引入Python。排除既有团队优势后，跨语言成本高于其实时基础设施收益。

### Next.js全栈

本系统不需要SEO或服务端页面渲染。将WebSocket、文件处理和后台任务放入Next.js会模糊运行时边界，因此只选择React + Vite作为客户端。

### Supabase或Firebase

可以快速完成原型，但权威房间状态、细粒度故障恢复、自托管复杂度和长期基础设施控制不如当前方案直接。

### Phoenix

实时能力很强，但会引入Elixir和更小的PDF/AI生态，不符合单语言和AI可验证性目标。

## 18. 需要重新评估本决策的条件

只有出现以下情况时才重新评估主技术栈：

- 实测单房间连接或消息量远超当前设计规模。
- 所内明确要求复用特定统一平台或运行时。
- TypeScript生态无法满足关键PDF、OCR或模型部署要求。
- 系统从所内工具演变为需要多地域、高可用的公共平台。
- 长期测试表明 Socket.IO协议在目标浏览器中存在无法接受的问题。

在这些条件出现前，不因局部库偏好更换框架。

## 19. 官方参考资料

- [NestJS WebSocket Gateway](https://docs.nestjs.com/websockets/gateways)
- [NestJS 队列](https://docs.nestjs.com/techniques/queues)
- [Socket.IO 消息交付保证](https://socket.io/docs/v4/delivery-guarantees/)
- [Socket.IO 连接状态恢复](https://socket.io/docs/v4/connection-state-recovery/)
- [Socket.IO Redis Streams Adapter](https://socket.io/docs/v4/redis-streams-adapter/)
- [Prisma ORM](https://www.prisma.io/docs/orm)
- [Prisma迁移历史](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/migration-histories)
- [BullMQ Worker](https://docs.bullmq.io/guide/workers)

