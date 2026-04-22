"use client";

import type {
  ConceptCluster,
  GoldStandardEntry,
  MergeResult,
  QualityFlag,
  ReviewDecision
} from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DecisionButtons } from "@/components/phase3/DecisionButtons";
import { DimensionTable } from "@/components/phase3/DimensionTable";
import { SegmentRenderer } from "@/components/phase3/SegmentRenderer";
import { SourceComparison } from "@/components/phase3/SourceComparison";

interface ReviewCardProps {
  cluster: ConceptCluster;
  goldEntry?: GoldStandardEntry;
  result: MergeResult;
  decision?: ReviewDecision;
  onAcceptMerge: (clusterId: string) => void;
  onAcceptSourceOriginal: (clusterId: string, author: string) => void;
  onManualSave: (clusterId: string, text: string) => void;
  onDefer: (clusterId: string) => void;
}

const QUALITY_FLAG_META: Record<
  QualityFlag,
  { label: string; tone: "warning" | "danger" | "neutral" }
> = {
  sentence_form: { label: "句式不完整", tone: "danger" },
  logic_order: { label: "逻辑顺序可疑", tone: "warning" },
  circular_definition: { label: "循环定义", tone: "danger" },
  too_long: { label: "定义过长", tone: "warning" },
  clause_too_long: { label: "从句过长", tone: "warning" },
  abbreviation: { label: "含未展开缩写", tone: "warning" },
  grammar: { label: "疑似病句", tone: "warning" }
};

function coverageLabel(result: MergeResult) {
  if (result.definition_source === "gold_standard") return "金标准覆盖";
  const definedCount = result.source_entries.filter((item) => item.has_definition).length;

  if (result.in_template_scope && definedCount === 0) return "模板内待补充";
  if (!result.in_template_scope) return "模板外词条";
  if (definedCount > 1) return "多来源";
  if (definedCount === 1) return "单一来源";
  return "未分类";
}

function badgeToneByCoverage(label: string): "neutral" | "success" | "warning" | "danger" {
  if (label === "金标准覆盖" || label === "多来源" || label === "单一来源") return "success";
  if (label === "模板内待补充") return "warning";
  if (label === "模板外词条") return "danger";
  return "neutral";
}

export function ReviewCard({
  cluster,
  goldEntry,
  result,
  decision,
  onAcceptMerge,
  onAcceptSourceOriginal,
  onManualSave,
  onDefer
}: ReviewCardProps) {
  const coverage = coverageLabel(result);
  const sourceOptions = result.source_entries
    .filter((entry) => entry.has_definition)
    .map((entry) => ({
      author: entry.author,
      text: entry.definition
    }));
  const decisionLabel =
    decision?.decision === "accept_gold_standard"
      ? "已采纳金标准"
      : decision?.decision === "accept_merge"
      ? "已采纳合并稿"
      : decision?.decision === "accept_source_original"
        ? `已采纳专家原文${decision.selected_source_author ? `（${decision.selected_source_author}）` : ""}`
        : decision?.decision === "manual_edit"
          ? "已手动编辑"
          : decision?.decision === "defer"
            ? "待议"
            : "待审阅";

  return (
    <Card
      className={[
        "border",
        result.status === "ai_failed" ? "border-rose-300" : "border-slate-200"
      ].join(" ")}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-cfh-ink">
              {result.term_name_cn || cluster.canonical_name_cn || cluster.cluster_id}
              {result.term_name_en ? ` / ${result.term_name_en}` : ""}
            </p>
            <p className="text-xs text-cfh-muted">
              {cluster.cluster_id} · {result.chapter}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={badgeToneByCoverage(coverage)}>{coverage}</Badge>
            <Badge tone={decision?.decision === "defer" ? "warning" : "neutral"}>{decisionLabel}</Badge>
          </div>
        </div>

        {result.quality_flags.length > 0 ? (
          <section className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-medium text-cfh-muted">质量告警</p>
            <div className="flex flex-wrap gap-2">
              {result.quality_flags.map((flag) => (
                <Badge key={flag} tone={QUALITY_FLAG_META[flag].tone}>
                  {QUALITY_FLAG_META[flag].label}
                </Badge>
              ))}
            </div>
          </section>
        ) : null}

        {result.excluded_sources.length > 0 ? (
          <section className="rounded-md border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-medium text-cfh-muted">被排除来源</p>
            <ul className="space-y-1 text-xs text-cfh-ink">
              {result.excluded_sources.map((item) => (
                <li key={`${item.author}-${item.reason}`}>
                  {item.author}：{item.reason}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <section className="rounded-md border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-medium text-cfh-muted">
                {result.definition_source === "gold_standard"
                  ? "金标准定义"
                  : "合并建议稿（短语级来源标注）"}
              </p>
              <SegmentRenderer
                fallbackText={decision?.final_text || result.merged_definition}
                segments={decision?.final_segments.length ? decision.final_segments : result.segments}
              />
              {goldEntry ? (
                <div className="mt-3 space-y-1 text-xs text-cfh-muted">
                  <p>
                    来源文件：<span className="text-cfh-ink">{goldEntry.source_doc}</span>
                  </p>
                  {goldEntry.source_excerpt ? (
                    <p>
                      来源摘录：<span className="text-cfh-ink">{goldEntry.source_excerpt}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            {result.definition_source !== "gold_standard" ? (
              <section className="rounded-md border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs font-medium text-cfh-muted">维度拆解表</p>
                <DimensionTable dimensions={result.dimensions} />
              </section>
            ) : null}

            <section className="rounded-md border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-medium text-cfh-muted">参考项</p>
              {result.reference_items.length > 0 ? (
                <ul className="space-y-1 text-xs text-cfh-ink">
                  {result.reference_items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-cfh-muted">本轮未生成术语级参考项。</p>
              )}
            </section>
          </div>

          <section className="rounded-md border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-medium text-cfh-muted">
              {result.definition_source === "gold_standard" ? "专家差异对照" : "原文对比"}
            </p>
            <SourceComparison sourceEntries={result.source_entries} />
          </section>
        </div>

        <DecisionButtons
          acceptLabel={result.definition_source === "gold_standard" ? "采纳金标准" : "采纳合并稿"}
          mergedText={result.merged_definition}
          onAcceptMerge={() => onAcceptMerge(result.cluster_id)}
          onAcceptSourceOriginal={(author) => onAcceptSourceOriginal(result.cluster_id, author)}
          onDefer={() => onDefer(result.cluster_id)}
          onManualSave={(text) => onManualSave(result.cluster_id, text)}
          showSourceOriginalAction={result.definition_source !== "gold_standard"}
          sourceOptions={sourceOptions}
        />
      </div>
    </Card>
  );
}
