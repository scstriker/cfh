"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { runMergePipeline, type MergeProgressEvent } from "@/lib/merger";
import { useAppContext } from "@/store/AppContext";

function nowLabel() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

export default function Phase2Page() {
  const router = useRouter();
  const { state, dispatch } = useAppContext();
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [event, setEvent] = useState<MergeProgressEvent | null>(null);
  const [error, setError] = useState("");

  const mergeResults = useMemo(() => Object.values(state.merge_results), [state.merge_results]);
  const successCount = mergeResults.filter((item) => item.status !== "ai_failed").length;
  const failedCount = mergeResults.filter((item) => item.status === "ai_failed").length;
  const totalPlanned = state.concept_clusters.filter((cluster) => cluster.include_in_scope !== false).length;
  const completedCount = event?.completed ?? successCount + failedCount;
  const liveSuccessCount = event?.success ?? successCount;
  const liveFailedCount = event?.failed ?? failedCount;
  const progressValue = totalPlanned > 0 ? (completedCount / totalPlanned) * 100 : 0;

  const appendLog = (message: string) => {
    setLogs((prev) => [...prev, `${nowLabel()} ${message}`]);
  };

  const startMerge = async () => {
    if (running) {
      return;
    }
    if (!state.api_key.trim()) {
      setError("请先输入 Gemini API Key。");
      return;
    }
    if (!state.primary_author.trim()) {
      setError("请先在阶段一设置主稿作者。");
      return;
    }
    if (state.concept_clusters.length === 0) {
      setError("请先在阶段零完成概念对齐。");
      return;
    }

    setError("");
    setLogs([]);
    setEvent(null);
    setRunning(true);
    appendLog("开始逐概念簇 AI 合并。");

    try {
      const results = await runMergePipeline({
        apiKey: state.api_key,
        parsedDocs: state.parsed_docs,
        conceptClusters: state.concept_clusters,
        primaryAuthor: state.primary_author,
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

  return (
    <div className="space-y-4">
      <Card title="阶段二：AI 逐条合并">
        <div className="space-y-3">
          <p className="text-sm text-cfh-muted">
            按概念簇串行调用 Gemini 3.1 Pro，自动进行失败重试并记录状态。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={running} onClick={startMerge} type="button">
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
