"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ReviewCard } from "@/components/phase3/ReviewCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { MergeResult, ReviewDecision, Segment } from "@/lib/types";
import { useAppContext } from "@/store/AppContext";

function buildSegmentsFromText(text: string, source: string): Segment[] {
  return text.trim() ? [{ text: text.trim(), source }] : [];
}

function mergeStatusByDecision(decision: ReviewDecision["decision"]): MergeResult["status"] {
  if (decision === "defer") return "deferred";
  if (decision === "manual_edit") return "edited";
  return "accepted";
}

export default function Phase3Page() {
  const router = useRouter();
  const { state, dispatch } = useAppContext();

  const results = useMemo(
    () =>
      state.concept_clusters
        .filter((cluster) => cluster.include_in_scope !== false)
        .map((cluster) => ({
          cluster,
          result: state.merge_results[cluster.cluster_id]
        }))
        .filter((item) => Boolean(item.result)) as Array<{
        cluster: (typeof state.concept_clusters)[number];
        result: MergeResult;
      }>,
    [state.concept_clusters, state.merge_results]
  );

  const stats = useMemo(() => {
    const total = results.length;
    let confirmed = 0;
    let deferred = 0;

    results.forEach((item) => {
      const decision = state.review_decisions[item.cluster.cluster_id];
      if (!decision) return;
      if (decision.decision === "defer") {
        deferred += 1;
      } else {
        confirmed += 1;
      }
    });

    const pending = total - confirmed - deferred;
    return { total, confirmed, pending, deferred };
  }, [results, state.review_decisions]);

  const groupedByChapter = useMemo(() => {
    const map = new Map<string, typeof results>();
    results.forEach((item) => {
      const chapter = item.result.chapter || "未分类";
      const list = map.get(chapter) ?? [];
      list.push(item);
      map.set(chapter, list);
    });

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "zh-Hans-CN"));
  }, [results]);

  const commitDecision = (clusterId: string, decision: ReviewDecision["decision"], finalText: string, finalSegments: Segment[]) => {
    dispatch({
      type: "SET_REVIEW_DECISION",
      payload: {
        cluster_id: clusterId,
        decision,
        final_text: finalText,
        final_segments: finalSegments,
        timestamp: new Date().toISOString()
      }
    });

    const existing = state.merge_results[clusterId];
    if (existing) {
      dispatch({
        type: "UPSERT_MERGE_RESULT",
        payload: {
          ...existing,
          status: mergeStatusByDecision(decision)
        }
      });
    }
  };

  const handleAcceptMerge = (clusterId: string) => {
    const result = state.merge_results[clusterId];
    if (!result) return;
    commitDecision(clusterId, "accept_merge", result.merged_definition, result.segments);
  };

  const handleAcceptPrimary = (clusterId: string) => {
    const result = state.merge_results[clusterId];
    if (!result) return;
    const text =
      result.primary_term?.definition ||
      result.source_entries.find((entry) => entry.has_definition)?.definition ||
      "";
    const source = result.primary_term?.author || state.primary_author || "主稿";
    commitDecision(clusterId, "accept_primary", text, buildSegmentsFromText(text, source));
  };

  const handleManualSave = (clusterId: string, text: string) => {
    commitDecision(clusterId, "manual_edit", text, buildSegmentsFromText(text, "手动编辑"));
  };

  const handleDefer = (clusterId: string) => {
    const result = state.merge_results[clusterId];
    if (!result) return;
    commitDecision(clusterId, "defer", result.merged_definition, result.segments);
  };

  const canExport = stats.total > 0 && stats.pending === 0 && stats.deferred === 0;

  return (
    <div className="space-y-4">
      <Card title="阶段三：交互式卡片审阅">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-cfh-muted">
              总计 {stats.total} 条，已确认 {stats.confirmed} 条，待审 {stats.pending} 条，待议 {stats.deferred} 条。
            </p>
            <Button disabled={!canExport} onClick={() => router.push("/phase4")} type="button">
              进入导出阶段
            </Button>
          </div>

          {stats.total > 0 ? (
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${(stats.confirmed / stats.total) * 100}%` }}
              />
              <div
                className="h-full bg-amber-400"
                style={{ width: `${(stats.deferred / stats.total) * 100}%` }}
              />
              <div
                className="h-full bg-slate-300"
                style={{ width: `${(stats.pending / stats.total) * 100}%` }}
              />
            </div>
          ) : (
            <p className="text-sm text-cfh-muted">暂无可审阅结果，请先完成阶段二合并。</p>
          )}
        </div>
      </Card>

      {groupedByChapter.map(([chapter, items]) => (
        <details key={chapter} className="rounded-xl bg-cfh-panel p-3 shadow-panel" open>
          <summary className="cursor-pointer text-sm font-semibold text-cfh-ink">
            {chapter}（{items.length}）
          </summary>
          <div className="mt-3 space-y-4">
            {items.map(({ cluster, result }) => (
              <ReviewCard
                key={cluster.cluster_id}
                cluster={cluster}
                decision={state.review_decisions[cluster.cluster_id]}
                onAcceptMerge={handleAcceptMerge}
                onAcceptPrimary={handleAcceptPrimary}
                onDefer={handleDefer}
                onManualSave={handleManualSave}
                primaryAuthor={state.primary_author}
                result={result}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
