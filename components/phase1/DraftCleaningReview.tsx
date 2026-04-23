"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { PendingImportResolution } from "@/lib/draftImport";
import type {
  DraftCleaningDecision,
  DraftCleaningIssue,
  PendingImportBatch
} from "@/lib/types";

interface DraftCleaningReviewProps {
  batch: PendingImportBatch;
  decisions: Record<string, DraftCleaningDecision>;
  onAcceptCleaning: (issueId: string) => void;
  onCommit: () => void;
  onKeepRaw: (issueId: string) => void;
  onManualSave: (issueId: string, nameCn: string, nameEn: string) => void;
  resolution: PendingImportResolution;
}

const ISSUE_LABEL: Record<DraftCleaningIssue["issue_type"], string> = {
  header_concat: "术语头串接",
  template_normalization: "模板标准化",
  typo_or_particle: "笔误/冗字",
  post_clean_duplicate: "清洗后重复",
  ambiguous_template_match: "模板匹配歧义"
};

const ISSUE_TONE: Record<DraftCleaningIssue["issue_type"], "neutral" | "warning" | "danger" | "success"> = {
  header_concat: "warning",
  template_normalization: "neutral",
  typo_or_particle: "neutral",
  post_clean_duplicate: "danger",
  ambiguous_template_match: "danger"
};

function decisionLabel(decision?: DraftCleaningDecision) {
  if (!decision) {
    return "待决策";
  }
  if (decision.action === "accept_cleaning") {
    return "已采纳建议";
  }
  if (decision.action === "keep_raw") {
    return "保留原始";
  }
  return "已手动编辑";
}

function renderTermName(nameCn: string, nameEn?: string) {
  return (
    <>
      <span className="font-medium">{nameCn}</span>
      {nameEn ? <span className="text-cfh-muted"> / {nameEn}</span> : null}
    </>
  );
}

function currentResultLabel(issue: DraftCleaningIssue, decision?: DraftCleaningDecision) {
  if (!decision) {
    return null;
  }

  if (decision.action === "keep_raw") {
    return {
      text: "当前处理结果：保留原始术语",
      tone: "warning" as const,
      value: renderTermName(issue.raw_name_cn, issue.raw_name_en)
    };
  }

  if (decision.action === "manual_edit") {
    const nameCn = decision.manual_name_cn?.trim() || issue.suggested_name_cn || issue.raw_name_cn;
    const nameEn = decision.manual_name_en?.trim() || issue.suggested_name_en || issue.raw_name_en;
    return {
      text: "当前处理结果：已按手动编辑保存",
      tone: "success" as const,
      value: renderTermName(nameCn, nameEn)
    };
  }

  if (issue.suggested_action === "drop") {
    return {
      text: "当前处理结果：已忽略该伪词条",
      tone: "success" as const,
      value: <span className="font-medium">该条不会进入最终导入结果</span>
    };
  }

  return {
    text: "当前处理结果：已采纳清洗建议",
    tone: "success" as const,
    value: renderTermName(issue.suggested_name_cn ?? issue.raw_name_cn, issue.suggested_name_en ?? issue.raw_name_en)
  };
}

function IssueCard({
  decision,
  issue,
  onAcceptCleaning,
  onKeepRaw,
  onManualSave
}: {
  decision?: DraftCleaningDecision;
  issue: DraftCleaningIssue;
  onAcceptCleaning: (issueId: string) => void;
  onKeepRaw: (issueId: string) => void;
  onManualSave: (issueId: string, nameCn: string, nameEn: string) => void;
}) {
  const [manualOpen, setManualOpen] = useState(decision?.action === "manual_edit");
  const [manualNameCn, setManualNameCn] = useState(
    decision?.manual_name_cn ?? issue.suggested_name_cn ?? issue.raw_name_cn
  );
  const [manualNameEn, setManualNameEn] = useState(
    decision?.manual_name_en ?? issue.suggested_name_en ?? issue.raw_name_en
  );
  const resultLabel = currentResultLabel(issue, decision);
  const acceptSelected = decision?.action === "accept_cleaning";
  const keepRawSelected = decision?.action === "keep_raw";
  const manualSelected = decision?.action === "manual_edit";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={ISSUE_TONE[issue.issue_type]}>{ISSUE_LABEL[issue.issue_type]}</Badge>
          <Badge tone={issue.status === "resolved" ? "success" : "warning"}>
            {issue.status === "resolved" ? "已决策" : "待决策"}
          </Badge>
          <Badge tone={issue.blocking ? "danger" : "neutral"}>{decisionLabel(decision)}</Badge>
        </div>
        <span className="text-xs text-cfh-muted">
          {issue.author} / {issue.file_name} / {issue.raw_term_id}
        </span>
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <p className="text-cfh-ink">
          原始术语：<span className="font-medium">{issue.raw_name_cn}</span>
          {issue.raw_name_en ? (
            <span className="text-cfh-muted"> / {issue.raw_name_en}</span>
          ) : null}
        </p>

        {issue.suggested_action === "rename" ? (
          <p className="text-cfh-ink">
            建议结果：<span className="font-medium">{issue.suggested_name_cn}</span>
            {issue.suggested_name_en ? (
              <span className="text-cfh-muted"> / {issue.suggested_name_en}</span>
            ) : null}
          </p>
        ) : null}

        {issue.suggested_action === "drop" ? (
          <p className="text-cfh-ink">
            建议结果：<span className="font-medium">忽略该伪词条</span>
          </p>
        ) : null}

        <p className="text-cfh-muted">
          原因：<span className="text-cfh-ink">{issue.reason}</span>
        </p>
        <p className="text-xs text-cfh-muted">
          置信度：{Math.round(issue.confidence * 100)}%
          {issue.template_term_id ? ` / 模板锚点：${issue.template_term_id}` : ""}
        </p>
        {resultLabel ? (
          <div
            className={[
              "rounded-md border px-3 py-2 text-sm",
              resultLabel.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            ].join(" ")}
          >
            <p>{resultLabel.text}</p>
            <p className="mt-1">{resultLabel.value}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          className={acceptSelected ? "ring-2 ring-cfh-accent/25" : ""}
          disabled={issue.suggested_action === "none"}
          onClick={() => onAcceptCleaning(issue.issue_id)}
          type="button"
          variant={acceptSelected ? "primary" : "secondary"}
        >
          接受清洗结果
        </Button>
        <Button
          className={keepRawSelected ? "ring-2 ring-cfh-accent/25" : ""}
          onClick={() => onKeepRaw(issue.issue_id)}
          type="button"
          variant={keepRawSelected ? "primary" : "secondary"}
        >
          保留原始结果
        </Button>
        <Button
          className={manualSelected ? "ring-2 ring-cfh-accent/25" : ""}
          onClick={() => setManualOpen((open) => !open)}
          type="button"
          variant={manualSelected ? "secondary" : "ghost"}
        >
          {manualOpen ? "收起手动编辑" : "手动编辑后保存"}
        </Button>
      </div>

      {manualOpen ? (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="text-xs text-cfh-muted">
            中文名
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-cfh-ink"
              onChange={(event) => setManualNameCn(event.target.value)}
              value={manualNameCn}
            />
          </label>
          <label className="text-xs text-cfh-muted">
            英文名
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-cfh-ink"
              onChange={(event) => setManualNameEn(event.target.value)}
              value={manualNameEn}
            />
          </label>
          <div className="md:col-span-2">
            <Button
              onClick={() => onManualSave(issue.issue_id, manualNameCn, manualNameEn)}
              type="button"
              variant="secondary"
            >
              保存手动编辑
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DraftCleaningReview({
  batch,
  decisions,
  onAcceptCleaning,
  onCommit,
  onKeepRaw,
  onManualSave,
  resolution
}: DraftCleaningReviewProps) {
  const orderedIssues = useMemo(
    () =>
      [...resolution.issues].sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === "pending" ? -1 : 1;
        }
        return left.issue_id.localeCompare(right.issue_id);
      }),
    [resolution.issues]
  );

  const pendingCount = resolution.issues.filter((issue) => issue.status === "pending").length;

  return (
    <Card title="导入清洗确认">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="text-cfh-muted">本批次</p>
            <p className="font-medium text-cfh-ink">
              {batch.raw_docs.length} 份文档 / {resolution.summary.term_count} 条 raw 术语
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="text-cfh-muted">清洗命中</p>
            <p className="font-medium text-cfh-ink">
              {resolution.summary.issue_count} 条
              {resolution.summary.blocking_issue_count > 0
                ? ` / 阻断 ${resolution.summary.blocking_issue_count} 条`
                : ""}
              {resolution.summary.auto_deduped_count > 0
                ? ` / 自动消重 ${resolution.summary.auto_deduped_count} 条`
                : ""}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="text-cfh-muted">当前状态</p>
            <p className="font-medium text-cfh-ink">
              {pendingCount === 0 ? "已可提交" : `仍有 ${pendingCount} 条待处理`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(resolution.summary.issue_counts).map(([type, count]) =>
            count > 0 ? (
              <Badge key={type} tone={ISSUE_TONE[type as DraftCleaningIssue["issue_type"]]}>
                {ISSUE_LABEL[type as DraftCleaningIssue["issue_type"]]}：{count}
              </Badge>
            ) : null
          )}
        </div>

        {resolution.summary.accepted_samples.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <p className="mb-2 font-medium text-cfh-ink">当前已采纳样例</p>
            <div className="space-y-1">
              {resolution.summary.accepted_samples.map((sample) => (
                <p key={`${sample.author}-${sample.raw_name_cn}-${sample.cleaned_name_cn}`} className="text-cfh-muted">
                  {sample.author}：<span className="text-cfh-ink">{sample.raw_name_cn}</span> →{" "}
                  <span className="text-cfh-ink">{sample.cleaned_name_cn}</span>
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {resolution.summary.auto_deduped_count > 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            系统已自动消重 {resolution.summary.auto_deduped_count} 条同名术语，重复项不会再要求人工逐条处理。
          </div>
        ) : null}

        {orderedIssues.length > 0 ? (
          <div className="space-y-3">
            {orderedIssues.map((issue) => (
              <IssueCard
                key={issue.issue_id}
                decision={decisions[issue.issue_id]}
                issue={issue}
                onAcceptCleaning={onAcceptCleaning}
                onKeepRaw={onKeepRaw}
                onManualSave={onManualSave}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-cfh-muted">本批次没有命中清洗规则，可以直接导入。</p>
        )}

        <div className="flex justify-end">
          <Button disabled={!resolution.can_submit} onClick={onCommit} type="button">
            提交本批次导入
          </Button>
        </div>
      </div>
    </Card>
  );
}
