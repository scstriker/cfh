"use client";

import type { ConceptCluster, MergeResult, ReviewDecision } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DecisionButtons } from "@/components/phase3/DecisionButtons";
import { DimensionTable } from "@/components/phase3/DimensionTable";
import { SegmentRenderer } from "@/components/phase3/SegmentRenderer";
import { SourceComparison } from "@/components/phase3/SourceComparison";

interface ReviewCardProps {
  cluster: ConceptCluster;
  result: MergeResult;
  decision?: ReviewDecision;
  primaryAuthor: string;
  onAcceptMerge: (clusterId: string) => void;
  onAcceptPrimary: (clusterId: string) => void;
  onManualSave: (clusterId: string, text: string) => void;
  onDefer: (clusterId: string) => void;
}

function coverageLabel(result: MergeResult, primaryAuthor: string) {
  const hasPrimary = result.source_entries.some(
    (item) => item.author === primaryAuthor && item.has_definition
  );
  const hasOthers = result.source_entries.some(
    (item) => item.author !== primaryAuthor && item.has_definition
  );

  if (result.source_entries.length === 0) return "待补数据";
  if (result.source_entries.length > 0 && result.source_entries.every((item) => !item.has_definition)) {
    return "无定义";
  }
  if (clusterIsOrphan(result, primaryAuthor)) return "孤儿词条";
  if (hasPrimary && hasOthers) return "主稿 + 他稿";
  if (hasPrimary && !hasOthers) return "仅主稿";
  if (!hasPrimary && hasOthers) return "主稿无定义";
  return "未分类";
}

function clusterIsOrphan(result: MergeResult, primaryAuthor: string) {
  const hasPrimaryAny = result.source_entries.some((item) => item.author === primaryAuthor);
  return !hasPrimaryAny;
}

function badgeToneByCoverage(label: string): "neutral" | "success" | "warning" | "danger" {
  if (label === "主稿 + 他稿" || label === "仅主稿") return "success";
  if (label === "孤儿词条" || label === "主稿无定义") return "danger";
  if (label === "无定义") return "warning";
  return "neutral";
}

export function ReviewCard({
  cluster,
  result,
  decision,
  primaryAuthor,
  onAcceptMerge,
  onAcceptPrimary,
  onManualSave,
  onDefer
}: ReviewCardProps) {
  const coverage = coverageLabel(result, primaryAuthor);
  const primaryText = result.primary_term?.definition ?? "";
  const canUsePrimary = Boolean(result.primary_term?.has_definition);
  const decisionLabel =
    decision?.decision === "accept_merge"
      ? "已采纳合并稿"
      : decision?.decision === "accept_primary"
        ? "已采纳主稿"
        : decision?.decision === "manual_edit"
          ? "已手动编辑"
          : decision?.decision === "defer"
            ? "待议"
            : "待审阅";

  return (
    <Card
      className={[
        "border",
        coverage === "主稿无定义" || coverage === "孤儿词条" ? "border-rose-300" : "border-slate-200"
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

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <section className="rounded-md border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-medium text-cfh-muted">合并建议稿（短语级来源标注）</p>
              <SegmentRenderer
                fallbackText={decision?.final_text || result.merged_definition}
                segments={decision?.final_segments.length ? decision.final_segments : result.segments}
              />
            </section>

            <section className="rounded-md border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-medium text-cfh-muted">维度拆解表</p>
              <DimensionTable dimensions={result.dimensions} />
            </section>
          </div>

          <section className="rounded-md border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-medium text-cfh-muted">原文对比</p>
            <SourceComparison primaryAuthor={primaryAuthor} sourceEntries={result.source_entries} />
          </section>
        </div>

        <DecisionButtons
          canUsePrimary={canUsePrimary}
          mergedText={result.merged_definition}
          onAcceptMerge={() => onAcceptMerge(result.cluster_id)}
          onAcceptPrimary={() => onAcceptPrimary(result.cluster_id)}
          onDefer={() => onDefer(result.cluster_id)}
          onManualSave={(text) => onManualSave(result.cluster_id, text)}
          primaryText={primaryText}
        />
      </div>
    </Card>
  );
}
