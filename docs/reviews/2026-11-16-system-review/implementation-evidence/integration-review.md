# 独立交付整合审阅

本文件记录 37 项实施和 R01–03 之间的交叉判断，不把角色聚焦通过数相加称为全仓通过。源码基线是 `1f4b37581c446770d576440f9ebb9bca5c55bfb7`，本地实施分支 `codex/research-workflow-integrity`。最终统一 gate 与原生联合旅程尚待作者交接；当前状态见 [主清单](../IMPLEMENTATION.md)。

## I01：恢复副本后再次发现同论文（X01 × W02/X02）

独立使用真实 SQLite、生产 export/import/addPaper 和临时磁盘复现：在同一 dataRoot 保留原项目 A，再恢复副本 B，B 原有论文具有正确的新 ID。修改 B 的个人阅读笔记后，再按 DOI 收藏这篇论文，addPaper 选中 A 的 canonical paper，B 从一条变两条；新增条目带 A 的原笔记，B 的修订笔记仍在旧恢复条目中。

首次观察：`addedId === originalId`，`addedId !== restoredId`，`count === 2`，两条 notes 分别为 `Original private reading` 和 `Restored revised reading`。这不是把恢复新 ID 本身误判为问题；恢复新 ID 和不覆盖原项目应继续保留。缺口是后续导入应先识别目标项目已存在的恢复副本，再考虑全局去重，不能把文献和笔记分裂。

可复跑[完整独立探针](restored-paper-discovery.cjs)：

```sh
node docs/reviews/2026-11-16-system-review/implementation-evidence/restored-paper-discovery.cjs
```

验收：恢复后再收藏复用 B 已有 ID，B 库仍一条，B 笔记/资产/新选文理由保留，A 原条目未改；强标识冲突不被标题相同强行合并。质量代理已修复匹配优先级；本视角对同一生产探针独立复跑退出0，[修后日志](restored-paper-discovery-independent-after.log)。B复用恢复ID、仍一条，B笔记/PDF/页索引/新理由及A原对象全断言通过。探针只用本任务临时目录且 finally 清理，无模型/外部写入。

## 覆盖核对与证据层次

| ID 范围 | 本轮整合核对 | 当前不能据此扩大声称 |
| --- | --- | --- |
| A01–05、L03、R02/R03 | 对照实际 context resolver、store facade/lease、App 选择/草稿/附件与来源回调，核阅双 dataRoot/同云 thread ID、恢复、真实磁盘原生与阶段行为日志 | 仍需最后联合原生；模块通过不等于所有异步 UI 路径均已验证 |
| L01/L02/B01/M01/PERF02 | 阅读 run manager、协议终止、结构化目标与输出留存的实现/正式行为；核阅默认 Docker、临时 SSH 与清理日志 | 任意批准 shell 不是通用沙箱；本机服务不证明真实研究服务器/全部模型服务 |
| R01/V01/V03 | 核对逐 step 证据、fresh run、初始/准备/最终收据、稿件完整源版本与 pin/保留边界，区分系统 TeX 与官方 managed 资源 | 不推断未知 DAG/数据集/完整环境；没有新增 same-run resume RPC；hash manifest 不是历史源文件备份 |
| W02/W03/X02 | 本视角曾参与实现，交叉证据来自后端 SQLite/IPC 与前端阶段原生；另核前端后续三项 BibTeX 修前/修后边界及本次 I01 | 组件重挂载不冒称应用重启；真实检索相关性、任意 TeX 宏无损未评测 |
| W01/W04–10 | 读取实际 CSV 关联 session、完整文件附件、图稿包、PNG stage→Writing 光标插入/回源、稿件 revision/独立 run 接线，核已有阶段原生 | 最后 PNG/签名/inactive、notes/news、W10 各入口 配置提示及历史根仍由唯一前端验收；不因静态通路就判通过 |
| X01/V02 | 阅读迁移 records/资源白名单、ID/root remap、历史恢复标记、比较 IPC owner 与精确十进制/JSON词元实现，核43项真实 SQLite/FS/组件结果；新交叉缺口用生产导出/恢复/收藏另复现 | Windows drive/UNC 是跨平台序列化 fixture，非 Windows 实机；比较不证明文件由 run 产生或科学复现 |
| C01/C02 | 核本地终态 revision、删除 journal/墓碑/显式重加规则、真实 PostgreSQL DDL/RLS及父级联修前/修后证据 | 本地最小 auth.uid 上下文、可控 SDK 不代表托管 Auth/Realtime 或两真实账户通过 |
| Q01–03、K01–05、PERF01 | Q修复保留原断言；核工具链/构建身份、包体file-set测量、有界快照实际read计数及公开验收说明 | 包体裁剪不等于 npm 安装减重；快照样本耗时不等于整应用/RSS改善；本地未发布包和未来release/多平台分开 |

以上覆盖所有37项和R01–03，没有增加平台愿景或按重叠聚焦数拼总通过数。无变化且证据已满意的实验不重跑；新I01才增加生产模块探针。代码改动期间的source hash只说明对应阶段受验内容，最后仍须冻结后的统一gate。

## 交付出口

1. I01修后独立探针与作者窄回归通过，证明B不重复、B笔记/PDF/选择理由及A原对象不变；本视角同一生产探针独立退出0；作者补充正常Daily/Bib组件交叉旅程，统一gate待验。
2. 前端最后联合原生只覆盖正常科研旅程，逐条记录CSV→稿件、图稿输入适用性、review/slides来源、notes/news与同ID双dataRoot；截图和实际磁盘结果绑定受验版本。
3. 质量代理运行统一lint、标准全套（含桌面和theme）与本地未发布package（含build）及资源验收，记录实际结果和未运行条件。
4. 公开范围为产品代码、必要公共说明与对应前后图/测试证据；本地docs/reviews和临时第三方资源不整目录发布。验收通过后按用户已有授权创建fork、推送分支并提交PR，不合并或发布release。


本阶段独立审阅已收口。没有启动额外假想边界审计或提出新增阻断/确认平台；后续只完成正常科研旅程、已出现痛点的回归、统一检查与PR交付。
