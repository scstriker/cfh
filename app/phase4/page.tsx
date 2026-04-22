"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { exportGbDocx, getSourceSummaryForPreview } from "@/lib/exporter";
import type { MergeResult } from "@/lib/types";
import { useAppContext } from "@/store/AppContext";

function finalText(result: MergeResult, decisionText?: string) {
  return decisionText || result.merged_definition || "（暂无内容）";
}

function decisionLabel(decision?: string) {
  if (decision === "accept_gold_standard") return "采纳金标准";
  if (decision === "accept_merge") return "采纳合并稿";
  if (decision === "accept_source_original") return "采纳专家原文";
  if (decision === "manual_edit") return "手动编辑";
  if (decision === "defer") return "待议";
  return "未决";
}

export default function Phase4Page() {
  const { state } = useAppContext();
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");

  const rows = useMemo(
    () =>
      state.concept_clusters
        .filter((cluster) => cluster.include_in_scope !== false)
        .map((cluster) => ({
          clusterId: cluster.cluster_id,
          chapter: state.merge_results[cluster.cluster_id]?.chapter || "未分类",
          termName: state.merge_results[cluster.cluster_id]?.term_name_cn || cluster.canonical_name_cn,
          result: state.merge_results[cluster.cluster_id]
        }))
        .filter((row) => Boolean(row.result)) as Array<{
        clusterId: string;
        chapter: string;
        termName: string;
        result: MergeResult;
      }>,
    [state.concept_clusters, state.merge_results]
  );

  const decisions = state.review_decisions;
  const stats = useMemo(() => {
    const total = rows.length;
    let pending = 0;
    let deferred = 0;

    rows.forEach((row) => {
      const decision = decisions[row.clusterId];
      if (!decision) {
        pending += 1;
      } else if (decision.decision === "defer") {
        deferred += 1;
      }
    });

    return { total, pending, deferred };
  }, [rows, decisions]);

  const canExport =
    Boolean(state.template_outline) &&
    stats.total > 0 &&
    stats.pending === 0 &&
    stats.deferred === 0;
  const sourceSummary = useMemo(
    () => getSourceSummaryForPreview(rows.map((row) => row.result), decisions),
    [rows, decisions]
  );

  const handleExport = async () => {
    if (!canExport || exporting) {
      return;
    }
    setExporting(true);
    setMessage("");
    try {
      await exportGbDocx({
        results: rows.map((row) => row.result),
        decisions,
        templateOutline: state.template_outline
      });
      setMessage("已生成并触发下载。");
    } catch (error) {
      console.error(error);
      setMessage("导出失败，请重试。");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="阶段四：导出 GB 文档">
        <div className="space-y-3">
          <p className="text-sm text-cfh-muted">
            导出前置条件：全部条目已完成审阅，且无“待议”项。当前总计 {stats.total} 条，未决{" "}
            {stats.pending} 条，待议 {stats.deferred} 条。
          </p>
          <Button disabled={!canExport || exporting} onClick={handleExport} type="button">
            {exporting ? "导出中..." : "生成并下载 .docx"}
          </Button>
          {message ? <p className="text-sm text-cfh-ink">{message}</p> : null}
        </div>
      </Card>

      <Card title="导出预览（只读）">
        {rows.length === 0 ? (
          <p className="text-sm text-cfh-muted">暂无可导出的审阅结果。</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const decision = decisions[row.clusterId];
              return (
                <div key={row.clusterId} className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="text-sm font-medium text-cfh-ink">
                    {row.termName}（{row.chapter}）
                  </p>
                  <p className="text-xs text-cfh-muted">
                    决策：{decisionLabel(decision?.decision)} / 状态：{row.result.status}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-cfh-ink">
                    {finalText(row.result, decision?.final_text)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="来源对照表">
        {sourceSummary.length === 0 ? (
          <p className="text-sm text-cfh-muted">暂无来源统计。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-cfh-muted">
                  <th className="px-2 py-1.5">来源专家</th>
                  <th className="px-2 py-1.5">片段数</th>
                </tr>
              </thead>
              <tbody>
                {sourceSummary.map((row) => (
                  <tr key={row.source} className="border-b border-slate-100">
                    <td className="px-2 py-1.5 text-cfh-ink">{row.source}</td>
                    <td className="px-2 py-1.5 text-cfh-ink">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
