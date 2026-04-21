# CFH 术语合并系统 — 任务清单

## Phase 1: 项目脚手架 & 基础 UI
- [x] Next.js 项目初始化（App Router + TypeScript + Tailwind）
- [x] 配置 `next.config.js`（`output: 'export'` 静态导出）
- [x] 安装核心依赖（`mammoth`, [docx](file:///Users/scstriker/Documents/codex-projects/cfh/inbox/%E5%BC%80%E5%8F%91%E6%96%87%E6%A1%A3/%E5%AE%9E%E6%96%BD%E6%96%B9%E6%A1%88_V2.docx), `file-saver`）
- [x] 配置中文字体（Noto Sans SC / Noto Serif SC）
- [x] 定义 TypeScript 类型 `lib/types.ts`
- [x] 实现全局状态管理 `store/AppContext.tsx` + `reducer.ts`
- [x] 根布局 `app/layout.tsx`（侧栏导航 + 阶段指示器 + API Key 输入）
- [x] 通用 UI 组件（Button, Card, ProgressBar, Badge, Modal）
- [x] 首页引导 `app/page.tsx`

## Phase 2: 文档导入与解析（实施方案阶段一）
- [x] DOCX 解析核心 `lib/parser.ts`
  - [x] mammoth.js HTML 提取
  - [x] DOMParser 结构化解析
  - [x] 章节标题识别
  - [x] 术语条目提取（编号/中文名/英文名/定义）
  - [x] fallback 解析增强：重复术语头去重、无空格中英术语识别、非术语章节误判过滤
  - [x] 完备性判定
  - [x] 文件名自动提取专家姓名
- [x] 文件上传组件 `FileUploader.tsx`（拖拽 + 点击）
- [x] 专家选择组件 `AuthorSelector.tsx`（主稿指定）
- [x] 解析预览组件 `ParsePreview.tsx`
- [x] 覆盖矩阵组件 `CoverageMatrix.tsx`
- [x] 阶段一页面 `app/phase1/page.tsx` 组装
- [x] 用 8 份真实 DOCX 文件验证解析结果

## Phase 3: 概念对齐（实施方案阶段零）
- [x] Gemini API 封装 `lib/gemini.ts`
  - [x] 通用调用函数（JSON 模式 + Schema 约束）
  - [x] 错误处理 + 重试逻辑
  - [x] `tools: []` 禁用外部搜索
- [x] Prompt 模板 `lib/prompts.ts`
  - [x] Phase 0 概念对齐 prompt
  - [x] Phase 2 逐术语合并 prompt（属+种差框架）
  - [x] JSON Response Schema 定义
- [x] 聚类卡片组件 `ClusterCard.tsx`
- [x] 孤儿词条面板 `OrphanTermPanel.tsx`
- [x] 对齐映射表 `AlignmentMatrix.tsx`
- [x] 用户交互：拆分/合并簇、修改挂载、确认锁定
- [x] 阶段零页面 `app/phase0/page.tsx` 组装

## Phase 4: AI 逐条合并（实施方案阶段二）
- [x] 合并逻辑 `lib/merger.ts`
  - [x] 逐概念簇串行调用
  - [x] 500ms 间隔 + 3 次指数退避重试
  - [x] fallback 合并增强：仅单一来源有定义时直接采用原文（不调用 AI）
  - [x] 失败标记 `ai_failed`
  - [x] 实时进度回调
- [x] 合并进度页面 `app/phase2/page.tsx`
  - [x] 进度条 + 当前术语名称
  - [x] 实时日志
  - [x] 完成/失败统计
  - [x] 自动跳转审阅阶段

## Phase 5: 交互式卡片审阅（实施方案阶段三）
- [x] 审阅卡片 `ReviewCard.tsx`（四分区布局）
  - [x] 顶栏：术语编号/名称/覆盖状态
  - [x] 左上：合并稿 + 短语级多色标注
  - [x] 左下：维度拆解表
  - [x] 右栏：原文对比折叠面板
- [x] 短语级来源渲染 `SegmentRenderer.tsx`（8 色底色）
- [x] 维度拆解表 `DimensionTable.tsx`
- [x] 原文对比面板 `SourceComparison.tsx`
- [x] 四按钮决策 `DecisionButtons.tsx`
  - [x] 采纳合并稿
  - [x] 采纳主稿原文
  - [x] 手动编辑（Modal 文本编辑器，按当前确认不做富文本）
  - [x] 标记待议
- [x] 四种特殊情况样式处理
- [x] 进度追踪（顶部进度条 + 章节折叠列表）
- [x] 阶段三页面 `app/phase3/page.tsx` 组装

## Phase 6: 导出 GB 格式文档（实施方案阶段四）
- [x] 导出引擎 `lib/exporter.ts`
  - [x] GB/T 1.1-2020 模板结构
  - [x] 封面 / 前言 / 正文 / 参考文献
  - [x] 字体控制（黑体/宋体/Times New Roman）
  - [x] 短语级来源 shading 高亮
  - [x] 来源对照表
- [x] 导出预览页面 `app/phase4/page.tsx`
- [x] .docx 文件生成 + 下载
- [ ] 用 Word 验证导出文件格式

## Phase 7: 抛光 & 部署
- [x] 响应式布局适配
- [x] localStorage 持久化审阅状态
- [x] 静态导出测试 `next build && next export`
- [x] 标准化发布命令 `npm run pipeline:release -- --input-dir ... --primary-author ... --output-path ...`
- [ ] AI Studio 部署验证
- [x] 端到端全流程测试（上传 → 对齐 → 合并 → 审阅 → 导出）
