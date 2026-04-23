"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { getPhase2Readiness } from "@/lib/phaseReadiness";
import { requiresUserGeminiApiKey } from "@/lib/runtimeMode";
import { runMergePipeline, type MergeProgressEvent } from "@/lib/merger";
import { useAppContext } from "@/store/AppContext";

function nowLabel() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

export default function Phase2Page() {
  const router = useRouter();
  const { state, dispatch, hydrated } = useAppContext();
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [event, setEvent] = useState<MergeProgressEvent | null>(null);
  const [error, setError] = useState("");

  const mergeResults = useMemo(() => Object.values(state.merge_results), [state.merge_results]);
  const readiness = useMemo(() => getPhase2Readiness(state), [state]);
  const successCount = mergeResults.filter((item) => item.status !== "ai_failed").length;
  const failedCount = mergeResults.filter((item) => item.status === "ai_failed").length;
  const totalPlanned = state.concept_clusters.filter((cluster) => cluster.include_in_scope !== false).length;
  const completedCount = event?.completed ?? successCount + failedCount;
  const liveSuccessCount = event?.success ?? successCount;
  const liveFailedCount = event?.failed ?? failedCount;
  const progressValue = totalPlanned > 0 ? (completedCount / totalPlanned) * 100 : 0;
  const redirectTarget =
    readiness.next_action === "term_units"
      ? "/phase1?resume=phase2-state-missing#term-unit-review"
      : "/phase1?resume=phase2-state-missing";

  useEffect(() => {
    if (!hydrated || readiness.ready) {
      return;
    }

    router.replace(redirectTarget);
  }, [hydrated, readiness.ready, redirectTarget, router]);

  const appendLog = (message: string) => {
    setLogs((prev) => [...prev, `${nowLabel()} ${message}`]);
  };

  const startMerge = async () => {
    const templateOutline = state.template_outline;
    if (running) {
      return;
    }
    if (requiresUserGeminiApiKey() && !state.api_key.trim()) {
      setError("请先输入 Gemini API Key。");
      return;
    }
    if (!readiness.ready) {
      setError(readiness.missing[0] ?? "请先完成阶段一到阶段二的前置准备。");
      return;
    }
    if (!templateOutline) {
      setError("请先在阶段一上传模板骨架。");
      return;
    }

    setError("");
    setLogs([]);
    setEvent(null);
    setRunning(true);
    appendLog("开始逐术语工作单元 AI 合并。");

    try {
      const results = await runMergePipeline({
        apiKey: state.api_key,
        parsedDocs: state.parsed_docs,
        templateOutline,
        conceptClusters: state.concept_clusters,
        goldStandardEntries: state.gold_standard_entries,
        model: "gemini-3.1-pro-preview",
        onProgress: (progressEvent) => {
          setEvent(progressEvent);
          appendLog(progressEvent.message);
        }
      });

      dispatch({ type: "SET_MERGE_RESULTS", payload: results });
      const values = Object.values(results);
      const failed = values.filter((item) => item.status === "ai_failed").length;
      appendLog(`合并结束：成功 ${values.length - failed}，失败 ${failed}。`);
      setTimeout(() => {
        router.push("/phase3");
      }, 900);
    } catch (mergeError) {
      console.error(mergeError);
      setError("合并流程执行失败，请查看日志并重试。");
      appendLog("合并流程异常终止。");
    } finally {
      setRunning(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Card title="阶段二：AI 逐条合并">
          <p className="text-sm text-cfh-muted">正在恢复本地项目状态，请稍候...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="阶段二：AI 逐条合并">
        <div className="space-y-3">
          <p className="text-sm text-cfh-muted">
            按术语工作单元串行调用 Gemini 3.1 Pro，自动进行失败重试并记录状态。
          </p>
          {hydrated && !readiness.ready ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm font-medium text-rose-700">当前不能进入阶段二</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
                {readiness.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => router.push("/phase1")} type="button" variant="secondary">
                  返回阶段一
                </Button>
                {readiness.next_action === "term_units" ? (
                  <Button onClick={() => router.push("/phase1#term-unit-review")} type="button" variant="secondary">
                    前往工作单元检查
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!hydrated || running || !readiness.ready} onClick={startMerge} type="button">
              {running ? "合并进行中..." : "开始全量合并"}
            </Button>
            <Button onClick={() => router.push("/phase3")} type="button" variant="secondary">
              查看审阅页
            </Button>
          </div>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
      </Card>

      <Card title="进度与统计">
        <div className="space-y-2">
          <ProgressBar label="总体进度" value={progressValue} />
          <p className="text-sm text-cfh-muted">
            计划 {totalPlanned} 条，已完成 {completedCount} 条，成功 {liveSuccessCount} 条，失败{" "}
            {liveFailedCount} 条。
          </p>
          {event ? (
            <p className="text-sm text-cfh-ink">
              当前：{event.term_name_cn}（{event.cluster_id}）
            </p>
          ) : null}
        </div>
      </Card>

      <Card title="实时日志">
        {logs.length === 0 ? (
          <p className="text-sm text-cfh-muted">尚无日志。</p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-auto rounded-md bg-slate-900 p-3">
            {logs.map((logLine, index) => (
              <p key={`${logLine}-${index}`} className="font-mono text-xs text-slate-100">
                {logLine}
              </p>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
