# 概念统一改造完整方案（Phase 0 增强）

## 1. 背景与目标

### 1.1 背景
当前系统的概念对齐流程已经可用（Phase 0），但覆盖矩阵与部分输入组织仍有优化空间：

- 当前 `CoverageMatrix` 仍按“术语名”分组展示，和实施计划中“行=概念簇”不一致。
- Phase 0 当前输入是“全量术语直接交给 LLM”，未利用前端可做的轻量候选归并信号。

### 1.2 目标
在不引入后端的前提下，升级为三层统一流程：

1. 字面预聚类（前端本地）  
2. LLM 语义精判（Gemini）  
3. 人工确认（拆分/合并/挂载）

并把覆盖矩阵的核心展示口径统一为“概念簇”。

---

## 2. 方案范围

## 2.1 本次纳入（In Scope）

- 新增轻量预聚类模块（纯前端）。
- 扩展 Phase 0 Prompt 输入结构（加入候选关系与候选簇）。
- 扩展 Phase 0 输出结构（增加 `confidence`、`rationale`、`mapping_type`）。
- 把覆盖矩阵改为“行=概念簇，列=专家，值=✔/○/—”。
- 在 Phase 0 页面展示“候选与模型判定”的可解释信息，保留人工改写能力。
- 增加对应单测与构建验证。

## 2.2 本次不纳入（Out of Scope）

- 后端服务化（任务队列、数据库、审计日志）。
- 高级知识图谱建模（OWL/RDF 三元组持久化）。
- 复杂协同编辑与多人并发控制。

---

## 3. 总体设计

## 3.1 三层流程

### Layer A：字面预聚类（Local Heuristic）

输入：`parsed_docs` 全量术语  
输出：`precluster_candidates`（候选关系）与 `precluster_groups`（候选簇）

规则建议：

- 中文名：归一化后编辑距离（Levenshtein）+ 包含关系。
- 英文名：token Jaccard 相似度。
- 编号/章节：只作弱特征，不作为同义判断主依据。

输出不直接“定案”，只给 LLM 提示，避免误合并。

### Layer B：LLM 精细判定（Gemini）

输入：全量术语清单 + 候选关系/候选簇  
输出：标准概念簇（最终建议）+ 每簇信心与理由 + 映射类型

新增输出字段：

- `confidence`: `0-1` 浮点  
- `rationale`: 文本理由  
- `mapping_type`: `exact | close | broad | narrow | related`

### Layer C：人工确认（Final Authority）

- 现有拆分/合并/改名/孤儿挂载继续保留。
- `mapping_type` 保留人工修正能力，但仅在 Phase 0、锁定前可编辑。
- `mapping_type` 编辑方式限定为枚举单选：`exact | close | broad | narrow | related`。
- `confidence`、`rationale` 在本轮保持展示态（只读），不作为人工编辑项。
- 锁定后进入 Phase 2。

---

## 4. 数据结构改造

## 4.1 `lib/types.ts`

新增类型：

- `SimilarityMethod = "cn_edit_distance" | "en_token_overlap" | "rule_mix"`
- `PreclusterCandidate`
- `PreclusterGroup`

扩展 `ConceptCluster`：

- `confidence?: number`
- `rationale?: string`
- `mapping_type?: "exact" | "close" | "broad" | "narrow" | "related"`
- `aliases?: string[]`（簇内术语变体展示）

---

## 5. 文件级修改清单

## 5.1 新增文件

1. `lib/precluster.ts`
- 实现：
  - 文本归一化
  - 编辑距离
  - 英文 token 重叠
  - 候选关系构造
  - 候选簇连通分量构造

2. `tests/precluster.test.ts`
- 覆盖：
  - 同义变体能被召回
  - 明显异义不应强行合并
  - 英文空值/中文空值边界处理

## 5.2 修改文件

1. `lib/prompts.ts`
- `buildAlignmentPrompt` 新增参数：
  - `preclusterCandidates`
  - `preclusterGroups`
- 对齐 schema 增加：
  - `confidence`
  - `rationale`
  - `mapping_type`

2. `app/phase0/page.tsx`
- 调用对齐前先执行 `buildPreclusters(...)`。
- 将预聚类结果注入 Prompt。
- 解析并落库新字段。
- UI 展示：
  - 置信度
  - 映射类型
  - 理由

3. `components/phase0/ClusterCard.tsx`
- 增加 `mapping_type/confidence/rationale` 展示。
- 仅 `mapping_type` 提供编辑控件（枚举单选），`confidence/rationale` 保持只读展示。

4. `components/phase1/CoverageMatrix.tsx`（或迁移至 Phase0）
- 改为按 `concept_clusters` 行渲染（建议保留同名组件，输入参数改造）：
  - 行：概念簇（显示推荐名 + 别名）
  - 列：专家
  - 单元：✔（有定义）/○（仅标题）/—（未提及）

5. `app/phase1/page.tsx` / `app/phase0/page.tsx`
- 调整覆盖矩阵显示时机：
  - 优先方案：Phase 0 结果出来后显示“概念簇覆盖矩阵”。
  - Phase 1 可保留“术语预览矩阵”（改名避免语义冲突）。

6. `tests/prompts.test.ts`
- 补对齐 prompt 中预聚类片段存在性断言。
- 补 schema 字段断言（`mapping_type/confidence/rationale`）。

---

## 6. 覆盖矩阵口径修正方案

## 6.1 口径定义（修正后）

- 行：`ConceptCluster`
- 列：作者（8位专家）
- 值：
  - `✔`：该作者在该簇有“有定义”的术语条目
  - `○`：该作者仅有标题/无定义条目
  - `—`：该作者未出现该簇成员

## 6.2 展示字段

- 主名称：`canonical_name_cn`
- 英文名：`canonical_name_en`
- 变体：`aliases`（简短折叠显示）
- 标注：`is_orphan`、`mapping_type`、`confidence`

---

## 7. 交付分解（最小可交付单元）

## Milestone 1：预聚类支撑层

- 完成 `lib/precluster.ts` + 单测
- 不改 UI，仅可在控制台输出候选

## Milestone 2：LLM 输入/输出增强

- Prompt + Schema 改造完成
- Phase0 能读写 `mapping_type/confidence/rationale`

## Milestone 3：覆盖矩阵口径切换

- 目标：
  - 将覆盖矩阵默认口径统一为“行=概念簇”，与 Phase 0 对齐结果保持一致。
- 范围：
  - `components/phase1/CoverageMatrix.tsx`（或迁移至 Phase0）切换到 `concept_clusters` 行渲染。
  - `app/phase1/page.tsx` / `app/phase0/page.tsx` 调整展示时机与调用参数。
  - 页面标题、说明文案、组件命名同步到“概念簇口径”。
- 执行步骤：
  1. 以 `concept_clusters` 作为行源，按簇成员回查 `parsed_docs` 计算单元格值（`✔/○/—`）。
  2. 每行展示 `canonical_name_cn`、`canonical_name_en`、`aliases`，并显示 `is_orphan/mapping_type/confidence` 标注。
  3. 若保留术语级矩阵，必须改名为“术语预览矩阵”，避免与覆盖矩阵混用。
- 边界条件：
  - 未完成 Phase 0 对齐时，不展示“概念簇覆盖矩阵”，仅显示术语预览或空态提示。
  - 同一作者在同簇内出现多条术语时，单元格按 `✔ > ○ > —` 聚合。
  - 本里程碑仅切换展示口径，不改变 Phase 2 的处理范围判定逻辑。
- 验收标准：
  - 覆盖矩阵行数与当前概念簇一致（或与页面筛选后的概念簇一致）。
  - 同义术语变体不再拆成多行。
  - 默认页面文案不再使用“行=术语”作为覆盖矩阵定义。
- 与前后里程碑衔接：
  - 依赖 Milestone 2 输出的 `concept_clusters` 与扩展字段。
  - 作为 Milestone 4 人工收口前的统一观察面板。

## Milestone 4：交互收口

- `mapping_type` 编辑控件收口（最终方案）：
  - 保留编辑能力，仅放在 Phase 0 的 ClusterCard。
  - 控件为下拉单选，选项固定为：`exact | close | broad | narrow | related`。
  - 不允许自由输入，不新增额外映射类型。
  - 编辑 `mapping_type` 不自动联动修改 `confidence/rationale`。
  - 点击“确认并进入阶段二”后，`mapping_type` 进入只读态。
- 锁定流程与下游兼容验证（Phase2/3/4）：
  - Phase2/3/4 读取 `mapping_type` 时需保持向后兼容（缺省值可回退为 `related`）。
  - 锁定后流程可连续完成合并、审阅、导出，不因映射类型修正产生阻塞。
- 验收标准：
  - 用户可在锁定前完成 `mapping_type` 修正并进入 Phase 2。
  - 修正后不影响 Phase2/3/4 主流程结果可用性。

---

## 8. 验收标准

## 8.1 功能验收

- 能在不调用后端前提下完成三层流程。
- 覆盖矩阵显示口径为概念簇。
- 术语变体（如“原子层刻蚀/原子级刻蚀加工”）能在同簇展示。
- 人工可修正模型输出并进入下一阶段。

## 8.2 测试验收

- `npm test` 全绿，新增 precluster 与 prompt 扩展测试通过。
- `npm run build` 通过，静态导出无回归。

## 8.3 手动验收

- 使用 `inbox/基础术语` 至少 3 份文档演示：
  - 预聚类候选合理
  - LLM 输出含 `mapping_type/confidence/rationale`
  - 覆盖矩阵按概念簇渲染

---

## 9. 风险与对策

1. 预聚类误导 LLM
- 对策：候选仅作提示，不作硬约束；Prompt 明确“可推翻候选”。

2. 概念簇过大导致误并
- 对策：UI 强化拆分操作，默认展示置信度低簇优先审阅。

3. 覆盖矩阵切换后用户认知成本
- 对策：保留“术语级预览”作为辅助表，不替代概念簇矩阵。

4. 输出结构变更影响 Phase2
- 对策：字段新增采用可选属性，保持向后兼容。

---

## 10. 实施顺序建议（优先级）

1. `P0`：`lib/precluster.ts` + `tests/precluster.test.ts`  
2. `P0`：`lib/prompts.ts` schema/Prompt 升级 + `tests/prompts.test.ts`  
3. `P1`：`app/phase0/page.tsx` 接入预聚类与新字段  
4. `P1`：`CoverageMatrix` 切换到概念簇口径  
5. `P2`：`ClusterCard` 增强（映射类型编辑、置信度/理由展示）  
6. `P2`：端到端手工验证与文档更新

---

## 11. 备注

- 本方案遵循当前 `implementation_plan.md` 主线，不扩展到后端架构。  
- 模型默认沿用当前项目选择：`gemini-3.1-pro-preview`。  
- 若后续改回“对齐 Pro + 合并 Flash”双模型策略，仅需在调用层切换模型名，不影响本方案结构。
