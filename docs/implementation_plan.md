# 原子级制造术语标准草案智能合并系统 —— Next.js 实施方案

> 基于 `实施方案_V2.docx`、`技术栈说明_V2.docx`、`可行性分析报告_V2.docx` 三份文档制定。

## 核心约束

- **纯前端项目**，部署在 Google AI Studio（或任何静态托管），**不含后端服务**
- 使用 **Next.js** 框架（`next export` 静态导出模式），取代原方案中的"单HTML文件"方案
- 所有 AI 能力通过 **浏览器端直接调用 Gemini REST API** 实现
- 所有界面及 AI 输出**全程中文**

> [!IMPORTANT]
> 原文档描述的是单 HTML + CDN 库 + Vanilla JS 架构。本方案将其迁移到 **Next.js App Router + React 组件化** 架构，核心业务逻辑不变，但 UI 层和状态管理升级为现代 React 模式。最终通过 `next export` 输出纯静态文件用于部署。

---

## 架构设计

### 技术选型

| 层级 | 原方案 | Next.js 方案 | 说明 |
|------|--------|-------------|------|
| UI 层 | HTML + Tailwind CDN + Vanilla JS | Next.js App Router + React + Tailwind CSS | 组件化开发 |
| 解析层 | mammoth.js CDN | `mammoth` npm 包 | .docx → HTML → JSON |
| 对齐层 | Gemini REST（1 次全量） | 同，封装为 async service | 术语消歧 + 孤儿挂载 |
| AI 合并层 | Gemini 2.5 Flash REST | 同，封装为 async service | 逐概念簇调用 |
| 导出层 | docx.js CDN + FileSaver | [docx](file:///Users/scstriker/Documents/codex-projects/cfh/inbox/%E5%BC%80%E5%8F%91%E6%96%87%E6%A1%A3/%E5%AE%9E%E6%96%BD%E6%96%B9%E6%A1%88_V2.docx) + `file-saver` npm 包 | GB/T 模板 .docx 生成 |
| 状态管理 | JS Object + localStorage | React Context + useReducer + localStorage | 全局状态 |

### 项目结构

```
cfh/
├── app/                         # Next.js App Router
│   ├── layout.tsx               # 根布局（字体、全局样式）
│   ├── page.tsx                 # 首页 / 引导页
│   ├── globals.css              # 全局样式 + Tailwind
│   ├── phase0/page.tsx          # 阶段零：概念对齐
│   ├── phase1/page.tsx          # 阶段一：文档导入与解析
│   ├── phase2/page.tsx          # 阶段二：AI 逐条合并
│   ├── phase3/page.tsx          # 阶段三：卡片审阅
│   └── phase4/page.tsx          # 阶段四：导出
├── components/
│   ├── ui/                      # 通用 UI 组件
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── Badge.tsx
│   │   └── Modal.tsx
│   ├── phase0/                  # 概念对齐组件
│   │   ├── ClusterCard.tsx      # 聚类结果卡片
│   │   ├── OrphanTermPanel.tsx  # 孤儿词条面板
│   │   └── AlignmentMatrix.tsx  # 对齐映射表
│   ├── phase1/                  # 文档导入组件
│   │   ├── FileUploader.tsx     # 拖拽上传区
│   │   ├── AuthorSelector.tsx   # 专家选择 & 主稿指定
│   │   ├── ParsePreview.tsx     # 解析预览
│   │   └── CoverageMatrix.tsx   # 覆盖矩阵
│   ├── phase3/                  # 卡片审阅组件
│   │   ├── ReviewCard.tsx       # 合并审阅卡片
│   │   ├── DimensionTable.tsx   # 维度拆解表
│   │   ├── SourceComparison.tsx # 原文对比面板
│   │   ├── SegmentRenderer.tsx  # 短语级来源标注渲染
│   │   └── DecisionButtons.tsx  # 四按钮决策组件
│   └── layout/
│       ├── Sidebar.tsx          # 阶段导航侧栏
│       ├── Header.tsx           # 顶栏（进度 + API Key）
│       └── StepIndicator.tsx    # 阶段步骤指示器
├── lib/
│   ├── gemini.ts                # Gemini API 封装
│   ├── parser.ts                # DOCX 解析逻辑
│   ├── merger.ts                # 合并逻辑编排
│   ├── exporter.ts              # GB/T docx 导出
│   ├── prompts.ts               # Prompt 模板管理
│   └── types.ts                 # TypeScript 类型定义
├── store/
│   ├── AppContext.tsx            # React Context Provider
│   └── reducer.ts               # useReducer 状态管理
├── next.config.js               # Next.js 配置（output: 'export'）
├── tailwind.config.js
├── package.json
└── tsconfig.json
```

---

## 分阶段实施方案

### Phase 1 — 项目脚手架 & 基础 UI

#### [NEW] 项目初始化
- `npx create-next-app@latest ./` 初始化 Next.js 项目
- 安装依赖：`mammoth`, [docx](file:///Users/scstriker/Documents/codex-projects/cfh/inbox/%E5%BC%80%E5%8F%91%E6%96%87%E6%A1%A3/%E5%AE%9E%E6%96%BD%E6%96%B9%E6%A1%88_V2.docx), `file-saver`
- 配置 `next.config.js`：`output: 'export'`（纯静态导出）
- Tailwind CSS 配置 + 中文字体（Noto Sans SC / Noto Serif SC）

#### [NEW] [layout.tsx](file:///Users/scstriker/Documents/codex-projects/cfh/app/layout.tsx)
- 根布局：侧栏导航 + 主内容区
- 五个阶段的导航入口（Phase 0-4），带步骤指示器
- 顶栏：API Key 输入框（存内存，不持久化）、项目标题
- 深色/浅色主题支持

#### [NEW] [store/AppContext.tsx](file:///Users/scstriker/Documents/codex-projects/cfh/store/AppContext.tsx)
- 全局状态管理：`parsedDocs`, `conceptClusters`, `mergeResults`, `reviewDecisions`, `apiKey`, `currentPhase`
- useReducer 管理状态变更
- localStorage 持久化审阅进度

#### [NEW] [lib/types.ts](file:///Users/scstriker/Documents/codex-projects/cfh/lib/types.ts)
- 完整 TypeScript 类型定义，对齐原文档数据结构：
  - `ParsedDoc`, `Term`, `ConceptCluster`, `MergeResult`, `Dimension`, `Segment`, `ReviewDecision`

---

### Phase 2 — 文档导入与解析（对应实施方案阶段一）

#### [NEW] [lib/parser.ts](file:///Users/scstriker/Documents/codex-projects/cfh/lib/parser.ts)
- `parseDocx(file: File): Promise<ParsedDoc>` 使用 mammoth.js 解析
- 流程：mammoth → HTML → DOMParser → 识别章节标题 → 提取术语条目（编号/中文名/英文名/定义）→ 判定完备性 → JSON
- 自动从文件名提取专家姓名

#### [NEW] [app/phase1/page.tsx](file:///Users/scstriker/Documents/codex-projects/cfh/app/phase1/page.tsx)
- 拖拽上传区（多文件）
- 上传后自动解析，展示解析预览
- 专家列表 + 主稿作者勾选
- 解析完成后展示覆盖矩阵

#### [NEW] [components/phase1/](file:///Users/scstriker/Documents/codex-projects/cfh/components/phase1)
- `FileUploader.tsx`：拖拽/点击上传，文件类型校验
- `AuthorSelector.tsx`：专家多选 + 主稿指定
- `ParsePreview.tsx`：解析后的术语表预览
- `CoverageMatrix.tsx`：行=概念簇, 列=8专家, ✔/○/— 标注

---

### Phase 3 — 概念对齐（对应实施方案阶段零）

#### [NEW] [lib/gemini.ts](file:///Users/scstriker/Documents/codex-projects/cfh/lib/gemini.ts)
- Gemini REST API 封装
  - `callGemini(prompt, systemInstruction, responseSchema?)` 通用调用
  - 自动 JSON 解析 & 错误处理
  - 支持 `responseMimeType: 'application/json'` + `responseSchema`
  - `tools: []`（禁用外部搜索）

#### [NEW] [lib/prompts.ts](file:///Users/scstriker/Documents/codex-projects/cfh/lib/prompts.ts)
- Phase 0 对齐 prompt：全量术语清单 → 概念聚类 + 推荐名称 + 孤儿挂载
- Phase 2 合并 prompt：属+种差框架 System Instruction + 逐术语合并 prompt
- 完整 JSON Schema 定义（`dimensions` + `segments` + `notes`）

#### [NEW] [app/phase0/page.tsx](file:///Users/scstriker/Documents/codex-projects/cfh/app/phase0/page.tsx)
- 一键触发概念对齐（单次 Gemini 调用）
- 展示聚类结果卡片：每个概念簇、成员术语、推荐标准名称
- 孤儿词条面板：展示挂载建议 + 章节 + 理由
- 用户可：拆分/合并簇、修改挂载位置、决定孤儿纳入与否
- 确认后锁定，进入下一阶段

---

### Phase 4 — AI 逐条合并（对应实施方案阶段二）

#### [NEW] [lib/merger.ts](file:///Users/scstriker/Documents/codex-projects/cfh/lib/merger.ts)
- 逐概念簇串行调用 Gemini
- 间隔 500ms，失败重试 3 次（指数退避）
- 仍失败标记 `ai_failed`，需人工处理
- 输出 `MergeResult`：`dimensions[]` + `segments[]` + `notes`
- 实时回调更新进度

#### [NEW] [app/phase2/page.tsx](file:///Users/scstriker/Documents/codex-projects/cfh/app/phase2/page.tsx)
- 进度条 + 当前处理术语名称
- 实时日志：显示每条术语的处理状态
- 完成/失败统计
- 全部完成后自动跳转至审阅阶段

--- 

### Phase 5 — 交互式卡片审阅（对应实施方案阶段三）

#### [NEW] [app/phase3/page.tsx](file:///Users/scstriker/Documents/codex-projects/cfh/app/phase3/page.tsx)
- 顶部进度条：绿=已确认，灰=待审阅，橙=待议
- 按章节折叠列表视图
- 全部确认后导出按钮亮起

#### [NEW] [components/phase3/ReviewCard.tsx](file:///Users/scstriker/Documents/codex-projects/cfh/components/phase3/ReviewCard.tsx)
- 卡片布局（V2 增强版）：
  - **顶栏**：术语编号、中文名、英文名、覆盖状态
  - **左上**：合并建议稿（短语级多色底色标注）
  - **左下**：维度拆解表（AI 种差维度 + 来源）
  - **右栏**：原文对比（折叠面板，逐专家展示）
  - **底栏**：四按钮决策

#### [NEW] [components/phase3/SegmentRenderer.tsx](file:///Users/scstriker/Documents/codex-projects/cfh/components/phase3/SegmentRenderer.tsx)
- 短语级来源标注渲染器
- 8 位专家 × 8 种颜色底色（对齐文档色值表）：
  | 专家 | 颜色 | 色值 |
  |------|------|------|
  | 宋凤麒 | 浅蓝 | #BDD7EE |
  | 关奉伟 | 浅绿 | #C6EFCE |
  | 吕鹏 | 浅橙 | #FCE4D6 |
  | 王可心 | 浅紫 | #D9D2E9 |
  | 张宏刚 | 浅红 | #F4CCCC |
  | 曹坤 | 浅青 | #D0E0E3 |
  | 柴智敏 | 浅粉 | #F4C2C2 |
  | 陈磊 | 浅黄 | #FFF2CC |

#### [NEW] [components/phase3/DecisionButtons.tsx](file:///Users/scstriker/Documents/codex-projects/cfh/components/phase3/DecisionButtons.tsx)
- 四按钮："采纳合并稿" / "采纳主稿原文" / "手动编辑" / "标记待议"
- 手动编辑弹出 Modal，纯文本编辑（不做富文本）

#### 四种特殊情况处理
1. **主稿有 + 他人有** → 标准合并卡片
2. **仅主稿有** → 直接采用，简化卡片
3. **主稿无 + 他人有** → 红框标注"待评审"
4. **孤儿词条** → 展示 AI 挂载建议

---

### Phase 6 — 导出 GB 格式文档（对应实施方案阶段四）

#### [NEW] [lib/exporter.ts](file:///Users/scstriker/Documents/codex-projects/cfh/lib/exporter.ts)
- 使用 [docx](file:///Users/scstriker/Documents/codex-projects/cfh/inbox/%E5%BC%80%E5%8F%91%E6%96%87%E6%A1%A3/%E5%AE%9E%E6%96%BD%E6%96%B9%E6%A1%88_V2.docx) npm 包生成 GB/T 1.1-2020 模板文档
- 模板结构：封面 → 前言 → 正文 → 参考文献
- 字体：标题黑体、正文宋体、英文 Times New Roman
- 短语级来源底色高亮（`shading` API）
- 文末附来源对照表

#### [NEW] [app/phase4/page.tsx](file:///Users/scstriker/Documents/codex-projects/cfh/app/phase4/page.tsx)
- 导出预览（只读卡片列表）
- 一键生成 .docx 下载
- 来源对照表展示

---

## User Review Required

> [!IMPORTANT]
> **架构升级**：原文档设计为单 HTML 文件 + CDN 库的极简方案。本方案将其升级为 Next.js App Router 项目，理由：
> 1. 组件化开发大幅提高可维护性（系统有 5 个阶段、20+ 组件）
> 2. TypeScript 类型安全保障复杂数据流的正确性
> 3. `next export` 仍然输出纯静态文件，完全兼容 AI Studio 部署P0 发布验收封板（先做）
目标：确认导出文档可作为交付物。
任务：在有 Microsoft Word 的机器打开 合并稿.docx，抽检术语准确性、章节归类、来源高亮。
产出：PASS 或问题清单（术语名/章节/来源标注逐条）。
依赖：Word 可用环境。

这部分已经完成并确认

将目前应该部署在aistudio的代码打包出zip
将目前应该部署在aistudio的代码打包出zip
> 4. 如果 AI Studio 部署遇到问题（不支持多页路由），可回退到 SPA 模式

> [!WARNING]
> **AI Studio 部署兼容性**：Next.js 静态导出生成多 HTML 文件 + JS chunks。请确认 AI Studio 是否支持：
> 1. 多文件静态站点部署
> 2. 客户端路由（如果不支持，可改用 hash router 或单页面模式）
> 3. 如果 AI Studio 仅支持单 HTML 文件，可能需要回退到原方案的 Vanilla JS 单文件方案
>
> **请确认 AI Studio 的具体部署限制。**

> [!IMPORTANT]
> **Gemini 模型选择**：
> - 文档中指定 `gemini-2.5-flash`，项目 markdown 中提到 `gemini-3.1-pro-preview`
> - 请确认最终使用哪个模型？建议对齐阶段用 Pro（精度高），合并阶段用 Flash（速度快）

---

## Verification Plan

### 静态导出验证

```bash
npm run build && npx serve out/
```
- 验证所有页面路由可访问
- 验证客户端 DOCX 解析在静态模式下正常工作

### 浏览器端手动测试

1. **Phase 1 文档上传**：拖入 8 份 DOCX → 检查是否正确解析出术语条目 + 覆盖矩阵
2. **Phase 0 概念对齐**：触发 Gemini → 检查聚类结果是否合理 → 测试拆分/合并操作
3. **Phase 2 AI 合并**：运行全量合并 → 检查进度条 + 失败重试 → 验证输出 JSON 结构
4. **Phase 3 卡片审阅**：检查多色标注 → 测试四个决策按钮 → 验证进度追踪
5. **Phase 4 导出**：生成 .docx → 用 Word 打开验证格式和来源标注
