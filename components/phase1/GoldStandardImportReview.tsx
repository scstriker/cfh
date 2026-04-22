"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { PendingGoldStandardImportResolution } from "@/lib/goldStandard";
import type {
  GoldStandardImportDecision,
  GoldStandardImportIssue,
  PendingGoldStandardImport,
  TemplateOutline
} from "@/lib/types";

interface GoldStandardImportReviewProps {
  decisions: Record<string, GoldStandardImportDecision>;
  onAcceptSuggestion: (issueId: string) => void;
  onCommit: () => void;
  onDropRow: (issueId: string) => void;
  onManualMap: (issueId: string, templateTermId: string) => void;
  pendingImport: PendingGoldStandardImport;
  resolution: PendingGoldStandardImportResolution;
  templateOutline: TemplateOutline;
}

const ISSUE_LABEL: Record<GoldStandardImportIssue["issue_type"], string> = {
  missing_template_term_id: "缺少模板 ID",
  invalid_template_term_id: "模板 ID 无效",
  name_match_review: "名称匹配待确认",
  unmatched_template_term: "无法匹配模板"
};

function decisionLabel(decision?: GoldStandardImportDecision) {
  if (!decision) return "待处理";
  if (decision.action === "accept_suggestion") return "已采纳建议";
  if (decision.action === "drop_row") return "已丢弃该行";
  return "已手动映射";
}

function IssueCard({
  decision,
  issue,
  onAcceptSuggestion,
  onDropRow,
  onManualMap,
  templateOutline
}: {
  decision?: GoldStandardImportDecision;
  issue: GoldStandardImportIssue;
  onAcceptSuggestion: (issueId: string) => void;
  onDropRow: (issueId: string) => void;
  onManualMap: (issueId: string, templateTermId: string) => void;
  templateOutline: TemplateOutline;
}) {
  const [manualTemplateTermId, setManualTemplateTermId] = useState(
    decision?.manual_template_term_id ?? issue.suggested_template_term_id ?? ""
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={issue.blocking ? "danger" : "warning"}>
            {ISSUE_LABEL[issue.issue_type]}
          </Badge>
          <Badge tone={issue.status === "resolved" ? "success" : "warning"}>
            {issue.status === "resolved" ? "已处理" : "待处理"}
          </Badge>
          <Badge tone="neutral">{decisionLabel(decision)}</Badge>
        </div>
        <span className="text-xs text-cfh-muted">CSV 第 {issue.row_index} 行</span>
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <p className="text-cfh-ink">
          术语：<span className="font-medium">{issue.raw_term_name_cn || "（空）"}</span>
          {issue.raw_term_name_en ? (
            <span className="text-cfh-muted"> / {issue.raw_term_name_en}</span>
          ) : null}
        </p>
        {issue.raw_template_term_id ? (
          <p className="text-cfh-muted">
            原始 template_term_id：
            <span className="text-cfh-ink"> {issue.raw_template_term_id}</span>
          </p>
        ) : null}
        {issue.suggested_template_term_id ? (
          <p className="text-cfh-muted">
            建议映射：
            <span className="text-cfh-ink">
              {" "}
              {issue.suggested_template_term_id} / {issue.suggested_term_name_cn}
            </span>
          </p>
        ) : null}
        <p className="text-cfh-muted">
          原因：<span className="text-cfh-ink">{issue.reason}</span>
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={!issue.suggested_template_term_id}
          onClick={() => onAcceptSuggestion(issue.issue_id)}
          type="button"
        >
          采纳建议映射
        </Button>
        <Button onClick={() => onDropRow(issue.issue_id)} type="button" variant="secondary">
          丢弃该行
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className="min-w-72 rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-cfh-ink"
          onChange={(event) => setManualTemplateTermId(event.target.value)}
          value={manualTemplateTermId}
        >
          <option value="">选择模板术语</option>
          {templateOutline.terms.map((term) => (
            <option key={term.template_term_id} value={term.template_term_id}>
              {term.template_term_id} / {term.chapter} / {term.name_cn}
            </option>
          ))}
        </select>
        <Button
          disabled={!manualTemplateTermId}
          onClick={() => onManualMap(issue.issue_id, manualTemplateTermId)}
          type="button"
          variant="ghost"
        >
          手动映射
        </Button>
      </div>
    </div>
  );
}

export function GoldStandardImportReview({
  decisions,
  onAcceptSuggestion,
  onCommit,
  onDropRow,
  onManualMap,
  pendingImport,
  resolution,
  templateOutline
}: GoldStandardImportReviewProps) {
  const pendingCount = resolution.issues.filter((issue) => issue.status === "pending").length;
  const orderedIssues = useMemo(
    () =>
      [...resolution.issues].sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === "pending" ? -1 : 1;
        }
        return left.row_index - right.row_index;
      }),
    [resolution.issues]
  );

  return (
    <Card title="金标准导入确认">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="text-cfh-muted">CSV 行数</p>
            <p className="font-medium text-cfh-ink">{pendingImport.rows.length} 条</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="text-cfh-muted">待确认问题</p>
            <p className="font-medium text-cfh-ink">{resolution.issues.length} 条</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="text-cfh-muted">当前状态</p>
            <p className="font-medium text-cfh-ink">
              {pendingCount === 0 ? "已可导入" : `仍有 ${pendingCount} 条待处理`}
            </p>
          </div>
        </div>

        {orderedIssues.length > 0 ? (
          <div className="space-y-3">
            {orderedIssues.map((issue) => (
              <IssueCard
                key={issue.issue_id}
                decision={decisions[issue.issue_id]}
                issue={issue}
                onAcceptSuggestion={onAcceptSuggestion}
                onDropRow={onDropRow}
                onManualMap={onManualMap}
                templateOutline={templateOutline}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-cfh-muted">该 CSV 不需要额外确认，可直接导入。</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-cfh-muted">
            导入后将生成 {resolution.entries.length} 条金标准词条，丢弃 {resolution.dropped_count} 条。
          </p>
          <Button disabled={!resolution.can_commit} onClick={onCommit} type="button">
            确认导入金标准
          </Button>
        </div>
      </div>
    </Card>
  );
}
