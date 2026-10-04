# Content Security LLM 中文管理端

独立的 Vue 3 + TypeScript + Vite + Vue Router + Element Plus 前端，连接 `content-security-llm` 的现有 FastAPI 接口。项目不包含 Python 后端、数据库迁移或模拟业务数据。

## 启动

要求 Node.js 22.18+ 或 24.12+，以及 pnpm。先按后端仓库 README 启动 FastAPI，再在本目录运行：

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

访问 Vite 输出的本地地址。开发服务器将 `/api` 代理到 `VITE_DEV_PROXY_TARGET`，并将仅用于顶部连通状态的 `/__api_health` 改写为模型服务的 `GET /`。默认目标是 `http://127.0.0.1:8001`。业务后端仍在 8000；管理端只访问模型服务，不直连业务后端。

`.env.example` 中的 `VITE_API_BASE_URL` 默认为空，此时 API 请求走同源代理。若填入完整的模型服务源地址，例如 `http://127.0.0.1:8001`，请求将直接发往该地址；跨源访问须由部署环境允许 CORS。生产环境建议同源部署并把 `/api` 和 `/__api_health` 反向代理至模型服务，其中后者改写为 `/`。不要将任何凭据写入环境变量；`VITE_` 变量会进入浏览器构建产物。模型服务自己的 `business_api_base_url` 由其服务端配置管理，与本管理端代理和治理 MySQL 配置不同。

```powershell
pnpm test
pnpm type-check
pnpm build
pnpm preview
```

## 操作与接口范围

- 右上角“会话凭据”分别录入 Bearer 访问令牌与管理员密钥。两者仅存于当前标签页的 `sessionStorage`，可分别清除。令牌创建后的原文只在当次成功界面展示。
- “访问令牌”使用管理员密钥创建、查询、补充旧标签、修改状态和删除。可从模型服务查询业务用户，选择启用账号，为其创建标签为 `business-user:<业务 ID>` 的独立模型令牌；账号停用不自动禁用已有模型令牌，同一用户也可持有多枚。手动创建仍可填写自定义标签。单枚令牌在列表行中按 ID 启停或删除并需确认；批量修改也会二次确认。删除是不可恢复的软删除：令牌立即失效并从列表消失，历史调用归属保留。
- “模型配置”使用 Bearer 令牌管理未删除模型。编辑时 API Key 留空表示不更新；删除为后端软删除。
- “治理任务配置”使用管理员密钥保存三类模型绑定和业务 MySQL 连接。保存配置不会测试 MySQL 连通性。服务可在没有业务库时启动，但 worker 执行任务会失败。
- “通用模型调用”从接口获取输出类型；调用记录可切换当前令牌和管理员跨令牌视图，不展示令牌哈希或原文。
- 三类治理工作区可提交验证任务、按 ID 查状态、查看只读结果。价值任务支持按完整范围列出；异常和风险没有任务列表接口，只保留本会话最近提交的 ID。`pending` 与 `running` 每 3 秒轮询；失败任务只有掌握原提交参数时才可“按原参数新建”。页面不控制独立 worker。
- 结果查询使用完整的 `dataset_id`、`version_id`、`language`、`scheme_id`。价值页可看最新结果、指定 ID 和分页样本筛选；异常与风险另有历史结果和样本详情。候选字段变更只读，风险正文展示后端返回的已遮蔽内容。所有结果 GET 均不触发模型调用。

## 目录

```text
src/
  api/                 两种响应格式与按接口分类的请求
  types/               后端业务类型
  stores/              当前会话凭据
  utils/               表单校验与任务轮询
  components/          范围输入和任务状态
  views/               令牌、模型、配置、调用、记录及三类治理工作区
  __tests__/           API 适配、轮询和关键表单测试
```

## 与后端代码核对的细节

- `POST /api/auth/token` 不返回令牌原文、ID 或标签；原文必须由前端暂存并仅在本次成功操作中显示，ID 和标签从管理员列表取得。
- `GET /api/v1/admin/business-users` 用管理员密钥从模型服务获取分页业务用户；管理端不获取业务登录令牌。返回的 `enabled` 只控制用户是否可在授权弹窗中被选择，不改变既有模型令牌状态。
- 价值和异常任务响应的 ID 字段为 `task_id`，风险任务为 `id`。价值任务列表要求 `kind` 和完整四元组；异常、风险没有列表接口。
- 业务库 GET 只返回连接元数据和 `password_configured`，重新保存时必须重新输入密码；旧 `settings.local.json` 的治理字段并非当前配置来源。
- `/api` 成功时直接返回对象或数组，DELETE 返回 204；`/api/v1` 的业务值在 `data` 中，失败消息与 `trace_id` 一并展示。
- 更换 Bearer 令牌后查询原任务或结果可能得到 404，这是按令牌隔离的正常边界。管理端不提供数据集目录、人工复核、change-sets、导出、KPI 或资源目录。
