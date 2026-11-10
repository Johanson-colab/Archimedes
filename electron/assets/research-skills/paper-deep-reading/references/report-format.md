# 报告数据与构建

## Archimedes 桌面格式

以下 Python 构建格式用于独立运行。桌面应用使用 `shared/paper-deep-reading.cjs` 的严格数据格式，由 `electron/paper-deep-reading.cjs` 提供当前阶段的字段说明：图片块引用 `assetId`，事实块用 `pages` 保存 PDF 页码，机制帧使用 `inputs`、`operations`、`outputs` 和 `diagram: {nodes, edges}`。桌面执行器校验这些结构并生成可信 SVG，不接收模型编写的 SVG 或文件路径。两个格式不可直接混用。

## 独立运行格式

在报告输出目录保存 `report.json`；图片位于其相对路径 `assets/`。执行：

```sh
python3 scripts/build_report.py /path/to/report.json --out /path/to/output --katex /path/to/node_modules/katex
python3 scripts/check_report.py /path/to/output/paper_report.html
```

构建器只使用 Python 标准库；有公式时需要 Node 与本地 KaTeX 模块（可用既有项目依赖），公式预渲染为 MathML。无公式时无需 Node。图像自包含到 HTML，Markdown 图片复制到输出 `assets/`，输出目录可以和 JSON 所在目录相同。

## 数据形状

所有文字字段使用 `{ "zh": "中文", "en": "English" }`；公式、数字、ID 和原图不翻译。原图里的英文无需伪造翻译，但图注/解释要双语。允许正文使用 `**加粗**` 与 `[来源](https://...)`；行内数学写作 `$...$`，构建时同样预渲染；普通段落不支持任意 HTML。

根对象包含：

- `title`：双语标题；`subtitle`：双语元信息/版本；`sections`：章节数组。
- 默认 section id 依次为 `overview, related-work, method, experiments, limitations, discussion, references`。用户自定结构时用 `--allow-custom-sections`；不要为通过程序检查填空章节。
- section：`id, title, blocks`。
- `coverage`：可选的主张覆盖表；`asset_review`：可选素材选择清单。保留来源和未解决问题，不能把“检查通过”当成科学结论。

## 正文块

| type | 字段 | 作用 |
|---|---|---|
| paragraph | text | 连续正文，主要事实自行包含页码 |
| heading | id, text | 二级标题，自动加入目录 |
| note | text | 证据范围/边界提示 |
| figure | src, alt, caption, source | 本地 PNG/JPG/WebP/GIF；完整原图及双语图注/页码，点击放大 |
| table | headers, rows, caption, source | 每个单元格为双语文字或数字；保留单位与精度 |
| formula | latex, explanation | LaTeX 与双语说明；HTML 用预渲染 MathML |
| details | title, text | 次要技术细节，可折叠；核心正文不能全部塞入 |
| comparison | title, unit, source, rows | rows: `{label, value}`；value 是实际报告数值，非负且同口径，零起点横条及静态数值表 |
| mechanism | title, source, illustrative, frames | frames: `{title, text, svg}`；每帧 SVG 展示真实操作状态及双语解释；支持播放/步进/进度/静态模式 |

`mechanism.frames.svg` 是报告作者提供的自包含 SVG；不可含脚本、事件属性、外链或 foreignObject。SVG 中文/英文标签可用 `data-zh`、`data-en`，无障碍名称可用 `data-aria-zh`、`data-aria-en`，模板会联动切换。每帧应显示输入、操作或输出的实质变化，不能仅换标题或颜色。示意设定 `illustrative: true`；source 明确“根据正文重绘/教学示意”及论文定位。帧不是论文实测训练轨迹。普通 figures 优先保持原图，交互作为追加解释。

示例（仅展示字段，正式报告需完整分析）：

```json
{"type":"figure","src":"assets/figure-1.png","alt":{"zh":"论文总体架构","en":"Overall architecture"},"caption":{"zh":"图1：总体流程","en":"Figure 1: overall process"},"source":{"zh":"原文第2页，图1","en":"Paper p. 2, Figure 1"}}
```

## 构建与内容校验的界限

构建器校验章节、双语字段、图片存在性、同口径数值格式、公式渲染和资源安全；`check_report.py` 检查导出的锚点、资源和图文覆盖提醒。它们不能核实图表数值、判断新颖性或证明文字深入，仍需原文复核与浏览器检查。图像缺失时构建报错；没有原图会给出警告，需解释论文是否确实不含适用图片。
