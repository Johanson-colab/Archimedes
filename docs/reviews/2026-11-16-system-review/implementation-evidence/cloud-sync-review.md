# C01 / C02 本地实现与验收

2026-11-16。没有提交、推送、PR、部署、真实账户、真实云密钥或付费服务调用。生产模块由上下文代理实现；`store.cjs` 的小批迁移/权限/事务接线由后端负责人接入并交叉验证。主窗口与 UI 未在本批启动或修改。

## 结论

**C01/C02 的本地业务协议、SQLite 持久化与真实 PostgreSQL 迁移/RLS 已通过。** 真实 Supabase 两账户、托管 Auth、Realtime 仍是环境条件验收；不能把本地 `auth.uid()` 上下文和可控 SDK 当成这些服务已经验收。主分支的云功能保持开放，release tag 的隐藏政策未改。

修前实际观察：已上传的同 ID turn 在本地结束为 incomplete 后，云端仍 running；删除本地已同步 library 后，重连重新导入该 library。[原始 2 失败日志](cloud-sync-before.log)及[原探针](cloud-sync-before.cjs)。同一探针现 **2/2 通过**：[修后日志](cloud-sync-regression-after.log)。

## C01：一次执行的终态不能倒退

`shared/cloud-sync.cjs` 约定 turn ID 是一次执行：active revision=1；completed/failed/incomplete/interrupted/needs_configuration/cancelled 均为 final revision=2。首次终态固定该 ID 的结果；重试必须用新 turn ID。active 文本仅允许前缀扩展，不能用旧片段缩短。此协议不把终态 turn 当作可持续改写的文档，也不声称实现通用多人文本 CRDT。

`thread-sync.cjs` 比较实际同 ID turn 内容/状态并上传更新，不再遇到 remote ID 就跳过；拉取每个 thread detail 后按执行 revision 合并，不依赖一次列表的 updated_at 决定是否漏掉完成状态。`store.applyCloudThread` 同样保护已落库的终态和事件 ID；thread 汇总状态从合并后的回合计算。失败/丢 ACK 保留可重试数据，不自动重放模型或危险命令。

PostgreSQL 0013 的 turn trigger 在数据库内实施相同终态/身份规则，包含旧 API 进程的直接 upsert；thread trigger 保留回合汇总状态，旧 header.status 不能恢复 running。既有终态回填 revision 2。若旧服务器的 turn 响应没有 revision，新客户端会提示需要 0013，继续保住本地终态，但不会声称旧服务端已有跨客户端保护。

## C02：删除是保留版本的关系变更

服务端 library 与 library_items 保留 `deleted_at/sync_revision`。普通列表只返回有效对象；协议 2 snapshot 同时返回有效对象和墓碑。删除论文只删除一个 library/paper 关系，保留 canonical paper 与其他库的引用。旧 DELETE 也由 PostgreSQL trigger 转为墓碑；viewer/outsider 不获得写权限。

删除过的 library ID 不复用，新建 library 得到新 ID。论文可由用户明确重加：本地 journal 记录该意图及已观察到的删除 revision，服务端在串行化的 membership 写入中校验 restore_revision。旧离线 add 缺少该版本，不能复活关系。重复 ACK/重试不会多增加版本；本地 mutation_id 比较也防止旧删除 ACK 吞掉后来的重加。

本地新增 `cloud_library_changes` journal。删除/移除与 journal 写入在同一 SQLite SAVEPOINT 内；重开仍保留未送达意图。首个 library create 在网络前绑定稳定 ID 并持久 pending create；首个 paper 上传尚无 cloud ID 时，删除按 canonical key 保留，之后从 snapshot 解析 ID。因而延迟的首次上传 ACK 不能把用户删除的内容重新导入。

`0013` 在事务内迁移，重复部署通过；它无法重建部署前已经被硬删除的历史。因此一个原先已关联但服务器完全不认识的 library ID 不自动重建，会保留本地内容并说明如何新建库再次分享。新建请求丢 ACK 则凭 pending create 与稳定 ID 重试。旧服务器缺少 versioned snapshot 时，客户端保留本地 tombstone/outbox，提示迁移，不回退发送无版本硬删除。原有非删除同步仍可用。

viewer 的正常同步可通过内部 cloudImport 读取/导入与观察墓碑；公开 create/add 入口仍要求 editor。同步层对 viewer 跳过全部库写入。内部选项不来自 renderer 的请求对象。

## 实际验证

1. **31/31、零跳过**：[cloud-sync-after.log](cloud-sync-after.log)。包含 8 个新增协议集成/行为测试及原 turn/library/comment/API/模型完整终止邻测。两端均是真实本地 SQLite，经过实际 `collaboration-api.cjs`、HTTP server 与受控 SDK 后端，覆盖 running→completed/failed/incomplete、partial+model_incomplete、丢完成 ACK、旧 header/turn 回放、关系删除/旧 pull、显式重加、其他库仍引用论文、删 ACK 丢失、重开 journal、晚 ACK、首次 paper/lib 上传中删除、viewer、旧服务器与迁移前未知 ID。
2. **17 通过、1 条件跳过**：[cloud-sync-adjacent.log](cloud-sync-adjacent.log)。annotation、project/member roles、服务端 SQLite/LAN、schema 与契约邻测。唯一跳过是真实 Supabase 两账户套件，因为没有提供测试账号，未取消该条件或伪造通过。
3. **实际 PostgreSQL 17**：[可复跑脚本](cloud-sync-postgres.cjs)、[成功输出](cloud-sync-postgres.log)。原 0001→0012 的 DDL/RLS 与新 0013 实际执行，0013 再执行一次；验证旧终态回填、同 ID running→incomplete、旧 upsert 与 header 不倒退、并发 final commit 与被锁等待的 stale running 更新、删除重试幂等、显式 re-add revision、旧 DELETE、peer editor 删除、library 墓碑、canonical paper 保留、viewer 允许 snapshot/拒绝删除、outsider 拒绝读取与增加。使用官方镜像 digest `sha256:a77aa70e641402a21411b92b721c58d10f23b50ae5fdd2333efd22d166e1e5f7`；CPU 1、内存 384MiB、无网络/端口、临时 tmpfs；仅清理本任务唯一命名容器，成功删除。plain Postgres 没有 vector 扩展，0001 仅声明而未使用其类型，因此只省略这一行；auth.users/auth.uid() 为本地最小上下文，业务 DDL/RLS 与迁移未替换成 JavaScript。
4. **A01 的后台路径**：新增测试提取当前 main 的真实 `collab:sync-libraries` handler，通过实际 workspace IPC 包装运行。A 拉取延迟期间 B 打开并写入、A 请求关闭，释放后 A 仍正确落原库，B 没有 A 内容。两个同步入口都显式 capture facade/lease；没有把“应当由 ALS 保持”的静态推断冒充验证。

Postgres 镜像首个 300 秒拉取到时退出；第二次获授权的有界缓存续拉成功，[拉取日志](cloud-sync-postgres-pull.log)。一次后续探针启动误把镜像初始化期的临时 Postgres 当成最终服务，[该失败输出](cloud-sync-postgres-startup-race.log)保留；脚本已等待镜像初始化完成再接受 pg_isready，最终运行成功。它没有隐去产品断言或跳过迁移。

根审阅补查的父删除路径也已闭合：[修前实际 PostgreSQL 失败](cloud-sync-parent-delete-before.log)确认无条件软删 trigger 使 owner 删除 project 后的子记录清理断言失败。0013 现在仅在 parent 已不存在时 `RETURN OLD` 放行原 FK cascade，直接 library/item DELETE 仍保留墓碑。最终同一真 PG 探针已同时验证 authenticated owner project 删除（含已墓碑/有效库、库内关系、成员）和数据库 owner 的 org 级联删除均无残留；没有新增终端用户 org 删除权限。该结果已并入最终 [Postgres 日志](cloud-sync-postgres.log)。

`git diff --check` 通过。全仓 lint/test/build/theme 仍由统一阶段执行，本批未重复启动全套或打包。

## 复跑

```sh
node --test --test-concurrency=2 electron/cloud-sync-integrity.test.cjs electron/thread-sync.test.cjs electron/library-sync.test.cjs electron/library-cloud-sync.test.cjs electron/session-comment-sync.test.cjs electron/model-completion.test.cjs electron/collaboration-api.test.cjs
node --test --test-concurrency=2 electron/annotation-sync.test.cjs electron/cloud-project-sync.test.cjs electron/collaboration-roles.test.cjs electron/collaboration-contracts.test.cjs electron/store-schema-order.test.cjs server/collab-server.test.cjs server/lan-server.test.cjs server/supabase-server.live.test.cjs
node --test docs/reviews/2026-11-16-system-review/implementation-evidence/cloud-sync-before.cjs
node docs/reviews/2026-11-16-system-review/implementation-evidence/cloud-sync-postgres.cjs
```

最后一条要求本机已运行 Docker desktop-linux 且已有 postgres:17-alpine 镜像；脚本显式 `--pull=never`，不会暗中下载或连接真实服务。当前源文件检查点见 [cloud-sync-source.sha256](cloud-sync-source.sha256)。
