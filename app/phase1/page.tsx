"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CoverageMatrix } from "@/components/phase1/CoverageMatrix";
import { DraftCleaningReview } from "@/components/phase1/DraftCleaningReview";
import { FileUploader } from "@/components/phase1/FileUploader";
import { GoldStandardImportReview } from "@/components/phase1/GoldStandardImportReview";
import { ParsePreview } from "@/components/phase1/ParsePreview";
import { TermUnitReview } from "@/components/phase1/TermUnitReview";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import {
  buildPendingImportBatch,
  resolvePendingImportBatch
} from "@/lib/draftImport";
import {
  buildPendingGoldStandardImport,
  resolvePendingGoldStandardImport
} from "@/lib/goldStandard";
import { getPhase2Readiness, type PhaseNextAction } from "@/lib/phaseReadiness";
import { parseTemplateDocx } from "@/lib/templateParser";
import {
  applyTermUnitMemberOverrides,
  buildAutomaticTermUnits,
  finalizeTermUnits,
  type TermUnitCandidateDecision,
  type TermUnitMemberOverride
} from "@/lib/termUnits";
import type {
  DraftCleaningDecision,
  GoldStandardImportDecision,
  ParsedDoc,
  PendingImportBatch,
  PendingGoldStandardImport
} from "@/lib/types";
import { useAppContext } from "@/store/AppContext";

type StatusTone = "neutral" | "warning" | "success" | "info" | "danger";
type UploadMutationKind = "template" | "gold_standard" | "experts";

interface PendingMutation {
  kind: UploadMutationKind;
  files: File[];
  title: string;
  consequences: string[];
  notice: string;
}

const cardToneClass: Record<StatusTone, string> = {
  neutral: "border-slate-200 bg-white",
  warning: "border-amber-200 bg-amber-50",
  success: "border-emerald-200 bg-emerald-50",
  info: "border-sky-200 bg-sky-50 ring-1 ring-sky-100",
  danger: "border-rose-200 bg-rose-50"
};

const badgeToneClass: Record<StatusTone, "neutral" | "warning" | "success" | "danger"> = {
  neutral: "neutral",
  warning: "warning",
  success: "success",
  info: "neutral",
  danger: "danger"
};

function StatusCard({
  title,
  statusLabel,
  summary,
  actionHint,
  tone
}: {
  title: string;
  statusLabel: string;
  summary: string;
  actionHint: string;
  tone: StatusTone;
}) {
  return (
    <Card className={`border ${cardToneClass[tone]}`}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-cfh-ink">{title}</h3>
          <Badge tone={badgeToneClass[tone]}>{statusLabel}</Badge>
        </div>
        <p className="text-sm text-cfh-ink">{summary}</p>
        <p className="text-xs text-cfh-muted">{actionHint}</p>
      </div>
    </Card>
  );
}

export default function Phase1Page() {
  const router = useRouter();
  const { state, dispatch } = useAppContext();
  const [isParsingDocs, setIsParsingDocs] = useState(false);
  const [isParsingGold, setIsParsingGold] = useState(false);
  const [isParsingTemplate, setIsParsingTemplate] = useState(false);
  const [docParseError, setDocParseError] = useState("");
  const [goldParseError, setGoldParseError] = useState("");
  const [templateParseError, setTemplateParseError] = useState("");
  const [pendingBatch, setPendingBatch] = useState<PendingImportBatch | null>(null);
  const [pendingDecisions, setPendingDecisions] = useState<Record<string, DraftCleaningDecision>>(
    {}
  );
  const [pendingGoldImport, setPendingGoldImport] = useState<PendingGoldStandardImport | null>(null);
  const [pendingGoldDecisions, setPendingGoldDecisions] = useState<
    Record<string, GoldStandardImportDecision>
  >({});
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [skipGoldConfirmOpen, setSkipGoldConfirmOpen] = useState(false);
  const [invalidationNotice, setInvalidationNotice] = useState("");
  const [memberOverrides, setMemberOverrides] = useState<Record<string, TermUnitMemberOverride>>({});
  const [candidateDecisions, setCandidateDecisions] = useState<
    Record<string, TermUnitCandidateDecision>
  >({});
  const [forceTermUnitReview, setForceTermUnitReview] = useState(false);
  const [resumeNotice, setResumeNotice] = useState("");

  useEffect(() => {
    setMemberOverrides({});
    setCandidateDecisions({});
    setForceTermUnitReview(false);
  }, [state.template_outline, state.gold_standard_entries, state.gold_standard_status, state.parsed_docs]);

  useEffect(() => {
    setCandidateDecisions({});
  }, [memberOverrides]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("resume") === "phase2-state-missing") {
      setResumeNotice(
        "本地项目状态未恢复，请从阶段一继续。若刚刚刷新页面或本地开发服务重启，已提交的模板、金标准、专家稿和术语工作单元会在恢复后显示。"
      );
      return;
    }

    setResumeNotice("");
  }, []);

  const pendingResolution = useMemo(() => {
    if (!pendingBatch) {
      return null;
    }
    return resolvePendingImportBatch(pendingBatch, pendingDecisions);
  }, [pendingBatch, pendingDecisions]);

  const pendingGoldResolution = useMemo(() => {
    if (!pendingGoldImport || !state.template_outline) {
      return null;
    }
    return resolvePendingGoldStandardImport(
      pendingGoldImport,
      pendingGoldDecisions,
      state.template_outline
    );
  }, [pendingGoldImport, pendingGoldDecisions, state.template_outline]);

  const goldStepDone = state.gold_standard_status !== "pending";
  const hasReviewWork =
    Object.keys(state.merge_results).length > 0 || Object.keys(state.review_decisions).length > 0;

  const autoBaseUnits = useMemo(() => {
    if (!state.template_outline || state.parsed_docs.length === 0) {
      return [];
    }

    return buildAutomaticTermUnits({
      parsedDocs: state.parsed_docs,
      templateOutline: state.template_outline,
      goldStandardEntries: state.gold_standard_entries
    });
  }, [state.parsed_docs, state.template_outline, state.gold_standard_entries]);

  const previewUnits = useMemo(() => {
    if (!state.template_outline || state.parsed_docs.length === 0) {
      return [];
    }

    const adjustedDocs = applyTermUnitMemberOverrides(state.parsed_docs, memberOverrides);
    return buildAutomaticTermUnits({
      parsedDocs: adjustedDocs,
      templateOutline: state.template_outline,
      goldStandardEntries: state.gold_standard_entries
    });
  }, [memberOverrides, state.gold_standard_entries, state.parsed_docs, state.template_outline]);

  const reviewMode = state.term_unit_status !== "reviewed" || forceTermUnitReview;
  const displayedUnits = reviewMode ? previewUnits : state.concept_clusters;

  const phase2Readiness = useMemo(
    () => getPhase2Readiness(state),
    [state.template_outline, state.gold_standard_status, state.parsed_docs, state.term_unit_status]
  );
  const nextAction = phase2Readiness.ready ? null : phase2Readiness.next_action;

  const parseTemplate = async (files: File[]) => {
    const [file] = files;
    if (!file) {
      return false;
    }

    setTemplateParseError("");
    setIsParsingTemplate(true);
    try {
      const parsed = await parseTemplateDocx(file);
      dispatch({
        type: "SET_TEMPLATE_DATA",
        payload: {
          template_doc: parsed.templateDoc,
          template_outline: parsed.templateOutline
        }
      });
      setPendingBatch(null);
      setPendingDecisions({});
      setPendingGoldImport(null);
      setPendingGoldDecisions({});
      return true;
    } catch (error) {
      console.error(error);
      setTemplateParseError("模板解析失败，请检查 DOCX 文件结构后重试。");
      return false;
    } finally {
      setIsParsingTemplate(false);
    }
  };

  const parseGoldStandard = async (files: File[]) => {
    const [file] = files;
    if (!file || !state.template_outline) {
      setGoldParseError("请先上传模板骨架，再导入金标准 CSV。");
      return false;
    }

    setGoldParseError("");
    setIsParsingGold(true);
    try {
      const nextPendingImport = await buildPendingGoldStandardImport(file, state.template_outline);
      setPendingGoldImport(nextPendingImport);
      setPendingGoldDecisions({});
      return true;
    } catch (error) {
      console.error(error);
      setGoldParseError(
        error instanceof Error ? error.message : "金标准 CSV 解析失败，请检查文件格式后重试。"
      );
      return false;
    } finally {
      setIsParsingGold(false);
    }
  };

  const parseExpertDocs = async (files: File[]) => {
    if (!state.template_outline) {
      setDocParseError("请先上传模板骨架，再导入专家草稿。");
      return false;
    }
    if (!goldStepDone) {
      setDocParseError("请先完成术语金标准步骤（导入或跳过），再导入专家草稿。");
      return false;
    }

    setDocParseError("");
    setIsParsingDocs(true);

    try {
      const batch = await buildPendingImportBatch(files, state.template_outline);
      setPendingBatch(batch);
      setPendingDecisions({});
      return true;
    } catch (error) {
      console.error(error);
      setDocParseError("专家稿解析失败，请检查 DOCX 文件结构后重试。");
      return false;
    } finally {
      setIsParsingDocs(false);
    }
  };

  const buildMutationConfirmation = (kind: UploadMutationKind, files: File[]): PendingMutation | null => {
    if (kind === "template") {
      const shouldConfirm =
        state.gold_standard_status !== "pending" ||
        state.parsed_docs.length > 0 ||
        state.term_unit_status !== "pending" ||
        hasReviewWork;
      if (!shouldConfirm) {
        return null;
      }
      return {
        kind,
        files,
        title: "确认重新上传模板骨架",
        consequences: [
          "已导入或已跳过的金标准步骤状态",
          "当前专家稿解析结果",
          "术语工作单元检查结果",
          "AI 合并结果",
          "审阅结果"
        ],
        notice: "模板已更新，金标准、专家稿、术语工作单元、AI 合并和审阅结果已失效，请按顺序重新准备。"
      };
    }

    if (kind === "gold_standard") {
      const shouldConfirm =
        state.gold_standard_status !== "pending" ||
        state.parsed_docs.length > 0 ||
        state.term_unit_status !== "pending" ||
        hasReviewWork;
      if (!shouldConfirm) {
        return null;
      }
      return {
        kind,
        files,
        title: "确认重新导入金标准",
        consequences: ["术语工作单元检查结果", "AI 合并结果", "审阅结果"],
        notice: "金标准已更新，术语工作单元、AI 合并和审阅结果已失效，请重新执行后续步骤。"
      };
    }

    const shouldConfirm =
      state.parsed_docs.length > 0 || state.term_unit_status !== "pending" || hasReviewWork;
    if (!shouldConfirm) {
      return null;
    }
    return {
      kind,
      files,
      title: "确认重新导入专家草稿",
      consequences: ["术语工作单元检查结果", "AI 合并结果", "审阅结果"],
      notice: "专家稿已更新，术语工作单元、AI 合并和审阅结果已失效，请重新执行后续步骤。"
    };
  };

  const requestMutation = async (kind: UploadMutationKind, files: File[]) => {
    const confirmation = buildMutationConfirmation(kind, files);
    if (confirmation) {
      setPendingMutation(confirmation);
      return;
    }

    const succeeded =
      kind === "template"
        ? await parseTemplate(files)
        : kind === "gold_standard"
          ? await parseGoldStandard(files)
          : await parseExpertDocs(files);
    if (succeeded) {
      setInvalidationNotice("");
    }
  };

  const invalidateForConfirmedMutation = (kind: UploadMutationKind) => {
    if (kind === "gold_standard") {
      dispatch({ type: "SET_GOLD_STANDARD_DATA", payload: null });
      return;
    }
    if (kind === "experts") {
      dispatch({ type: "SET_PARSED_DOCS", payload: [] });
    }
  };

  const confirmPendingMutation = async () => {
    if (!pendingMutation) {
      return;
    }

    const current = pendingMutation;
    setPendingMutation(null);
    invalidateForConfirmedMutation(current.kind);
    const succeeded =
      current.kind === "template"
        ? await parseTemplate(current.files)
        : current.kind === "gold_standard"
          ? await parseGoldStandard(current.files)
          : await parseExpertDocs(current.files);

    if (succeeded || current.kind === "gold_standard" || current.kind === "experts") {
      setInvalidationNotice(current.notice);
    }
  };

  const handleSetDecision = (decision: DraftCleaningDecision) => {
    setPendingDecisions((current) => ({
      ...current,
      [decision.issue_id]: decision
    }));
  };

  const handleSetGoldDecision = (decision: GoldStandardImportDecision) => {
    setPendingGoldDecisions((current) => ({
      ...current,
      [decision.issue_id]: decision
    }));
  };

  const handleCommitGoldImport = () => {
    if (!pendingGoldImport || !pendingGoldResolution) {
      return;
    }

    dispatch({
      type: "SET_GOLD_STANDARD_DATA",
      payload: {
        gold_standard_doc: pendingGoldImport.gold_standard_doc,
        gold_standard_entries: pendingGoldResolution.entries
      }
    });
    setPendingGoldImport(null);
    setPendingGoldDecisions({});
  };

  const handleCommitBatch = () => {
    if (!pendingBatch || !pendingResolution) {
      return;
    }

    const mergedMap = new Map<string, ParsedDoc>();
    [...state.parsed_docs, ...pendingResolution.cleaned_docs].forEach((doc) => {
      mergedMap.set(doc.file_name, doc);
    });

    dispatch({
      type: "SET_PARSED_DOCS",
      payload: Array.from(mergedMap.values())
    });
    setPendingBatch(null);
    setPendingDecisions({});
  };

  const confirmSkipGoldStandard = () => {
    dispatch({ type: "SET_GOLD_STANDARD_SKIPPED" });
    setPendingGoldImport(null);
    setPendingGoldDecisions({});
    setSkipGoldConfirmOpen(false);
    if (state.parsed_docs.length > 0 || state.term_unit_status !== "pending" || hasReviewWork) {
      setInvalidationNotice("已标记本轮无金标准，术语工作单元、AI 合并和审阅结果已失效，请重新执行后续步骤。");
    } else {
      setInvalidationNotice("");
    }
  };

  const handleSetMemberOverride = (memberKey: string, override?: TermUnitMemberOverride) => {
    setMemberOverrides((current) => {
      const next = { ...current };
      if (!override || override.action === "keep") {
        delete next[memberKey];
        return next;
      }
      next[memberKey] = override;
      return next;
    });
    setForceTermUnitReview(true);
  };

  const handleSetCandidateDecision = (
    clusterId: string,
    decision: TermUnitCandidateDecision
  ) => {
    setCandidateDecisions((current) => ({
      ...current,
      [clusterId]: decision
    }));
    setForceTermUnitReview(true);
  };

  const handleCommitTermUnitReview = () => {
    const nextUnits = finalizeTermUnits(previewUnits, candidateDecisions);
    dispatch({ type: "SET_CONCEPT_CLUSTERS", payload: nextUnits });
    dispatch({ type: "SET_TERM_UNIT_STATUS", payload: "reviewed" });
    setForceTermUnitReview(false);
  };

  const handleResetToAutoUnits = () => {
    dispatch({ type: "SET_CONCEPT_CLUSTERS", payload: autoBaseUnits });
    dispatch({ type: "SET_TERM_UNIT_STATUS", payload: "generated" });
    setMemberOverrides({});
    setCandidateDecisions({});
    setForceTermUnitReview(true);
  };

  const templateSummary = state.template_outline
    ? `已锁定 ${state.template_outline.chapter_order.length} 个章节、${state.template_outline.terms.length} 个术语。`
    : "尚未上传模板骨架。";
  const goldSummary =
    state.gold_standard_status === "imported"
      ? `已导入 ${state.gold_standard_entries.length} 条金标准词条。`
      : state.gold_standard_status === "skipped"
        ? "本轮已显式跳过金标准步骤。"
        : "尚未完成金标准步骤。";
  const expertSummary =
    state.parsed_docs.length > 0
      ? `已确认 ${state.parsed_docs.length} 份专家文档。`
      : !state.template_outline
        ? "需先上传模板骨架。"
        : !goldStepDone
          ? "需先完成金标准步骤后才能导入专家稿。"
          : "尚未上传专家稿。";

  const currentUnits = reviewMode ? previewUnits : state.concept_clusters;
  const inScopeUnitCount = currentUnits.filter((unit) => unit.include_in_scope !== false).length;
  const outOfScopeCandidateCount = currentUnits.filter((unit) => !unit.in_template_scope).length;
  const termUnitSummary =
    state.term_unit_status === "reviewed"
      ? `工作单元检查已完成，当前共 ${inScopeUnitCount} 条正文工作单元，另有 ${outOfScopeCandidateCount} 条模板外候选。`
      : currentUnits.length > 0
        ? `已自动生成 ${currentUnits.length} 条术语工作单元，待人工检查后进入阶段二。`
        : !state.template_outline || !goldStepDone || state.parsed_docs.length === 0
          ? "需先完成模板、金标准和专家稿准备。"
          : "尚未生成术语工作单元。";

  const expertDisabledReason = !state.template_outline
    ? "请先上传模板骨架。"
    : !goldStepDone
      ? "请先完成术语金标准步骤（导入或跳过）。"
      : "";

  const termUnitActionReason = !state.template_outline
    ? "请先上传模板骨架。"
    : !goldStepDone
      ? "请先完成术语金标准步骤（导入或跳过）。"
      : state.parsed_docs.length === 0
        ? "请先上传并确认专家草稿。"
        : state.term_unit_status === "reviewed"
          ? "如需调整，可重新开始术语工作单元检查。"
          : "请在阶段一下方完成术语工作单元检查。";

  const nextStepContent = (() => {
    if (phase2Readiness.ready) {
      return {
        title: "已满足进入阶段二的前置条件",
        body: "模板、金标准状态、专家稿和术语工作单元都已固定，可以进入阶段二开始全量合并。",
        actions: (
          <Button onClick={() => router.push("/phase2")} type="button">
            进入阶段二
          </Button>
        )
      };
    }

    const contentByAction: Record<
      Exclude<PhaseNextAction, null>,
      { title: string; body: string; actions?: ReactNode }
    > = {
      template: {
        title: "下一步：上传模板骨架",
        body: "模板骨架会锁定本轮术语范围，其余步骤都依赖它。请先完成模板上传。"
      },
      gold_standard: {
        title: "下一步：完成术语金标准步骤",
        body: "请导入金标准 CSV，或明确点击“本轮无金标准 / 跳过”。未完成这一步前，专家稿不会开放。",
        actions: (
          <div className="flex flex-wrap gap-2">
            <Link href="/tools/gold-standard-converter">
              <Button type="button" variant="secondary">
                打开金标准转换工具
              </Button>
            </Link>
            <Button onClick={() => setSkipGoldConfirmOpen(true)} type="button" variant="secondary">
              本轮无金标准 / 跳过
            </Button>
          </div>
        )
      },
      experts: {
        title: "下一步：上传并确认专家草稿",
        body: "金标准步骤已完成。请继续导入专家稿，完成清洗确认后系统会自动生成术语工作单元。"
      },
      term_units: {
        title: "下一步：完成术语工作单元检查",
        body:
          state.term_unit_status === "generated"
            ? "系统已经自动汇总模板内术语和模板外候选，请在阶段一下方完成人工检查。"
            : "请先导入专家稿，系统才会自动生成术语工作单元。"
      }
    };

    return contentByAction[nextAction ?? "template"];
  })();

  return (
    <div className="space-y-4">
      {resumeNotice ? (
        <Card className="border border-amber-200 bg-amber-50" title="已返回阶段一">
          <p className="text-sm text-amber-800">{resumeNotice}</p>
        </Card>
      ) : null}

      {invalidationNotice ? (
        <Card className="border border-rose-200 bg-rose-50" title="已重置下游结果">
          <p className="text-sm text-rose-700">{invalidationNotice}</p>
        </Card>
      ) : null}

      <Card title="进入阶段二前的前置条件">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatusCard
              actionHint={
                !state.template_outline
                  ? "当前建议：先上传模板骨架，锁定本轮术语范围。"
                  : nextAction === "gold_standard"
                    ? "模板已完成，下一步处理术语金标准。"
                    : "模板术语范围已固定。"
              }
              statusLabel={state.template_outline ? "已完成" : "未开始"}
              summary={templateSummary}
              title="模板骨架"
              tone={!state.template_outline ? (nextAction === "template" ? "info" : "neutral") : "success"}
            />
            <StatusCard
              actionHint={
                state.gold_standard_status === "imported"
                  ? "命中模板的金标准词条会在阶段二锁定正文定义。"
                  : state.gold_standard_status === "skipped"
                    ? "本轮未提供金标准，相关词条将全部走专家合并。"
                    : "当前建议：导入金标准 CSV，或明确跳过本轮金标准。"
              }
              statusLabel={
                state.gold_standard_status === "imported"
                  ? "已完成"
                  : state.gold_standard_status === "skipped"
                    ? "已跳过"
                    : "待处理"
              }
              summary={goldSummary}
              title="术语金标准"
              tone={
                state.gold_standard_status === "imported" || state.gold_standard_status === "skipped"
                  ? "success"
                  : !state.template_outline
                    ? "neutral"
                    : nextAction === "gold_standard"
                      ? "info"
                      : "warning"
              }
            />
            <StatusCard
              actionHint={
                state.parsed_docs.length > 0
                  ? "专家稿已确认，系统会自动生成术语工作单元。"
                  : !state.template_outline
                    ? "等待模板骨架完成。"
                    : !goldStepDone
                      ? "等待术语金标准步骤完成。"
                      : "当前建议：上传并确认专家草稿。"
              }
              statusLabel={state.parsed_docs.length > 0 ? "已完成" : goldStepDone ? "待处理" : "未开始"}
              summary={expertSummary}
              title="专家草稿"
              tone={
                state.parsed_docs.length > 0
                  ? "success"
                  : !state.template_outline || !goldStepDone
                    ? "neutral"
                    : nextAction === "experts"
                      ? "info"
                      : "warning"
              }
            />
            <StatusCard
              actionHint={
                state.term_unit_status === "reviewed"
                  ? "术语工作单元已固定，可以进入阶段二。"
                  : currentUnits.length > 0
                    ? "当前建议：在阶段一下方完成工作单元检查。"
                    : "需先完成上游准备步骤。"
              }
              statusLabel={
                state.term_unit_status === "reviewed"
                  ? "已完成"
                  : currentUnits.length > 0
                    ? "待检查"
                    : "未开始"
              }
              summary={termUnitSummary}
              title="术语工作单元检查"
              tone={
                state.term_unit_status === "reviewed"
                  ? "success"
                  : currentUnits.length > 0
                    ? nextAction === "term_units"
                      ? "info"
                      : "warning"
                    : "neutral"
              }
            />
          </div>

          <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-sky-900">{nextStepContent.title}</p>
                <p className="mt-1 text-sm text-sky-800">{nextStepContent.body}</p>
              </div>
              {nextStepContent.actions ? <div>{nextStepContent.actions}</div> : null}
            </div>
          </div>
        </div>
      </Card>

      <FileUploader
        description="先上传 1 份模板骨架 DOCX。模板只决定章节结构和术语范围，不参与定义合并。"
        disabled={isParsingTemplate}
        multiple={false}
        onFilesSelected={(files) => requestMutation("template", files)}
        title="上传模板骨架"
      />

      {isParsingTemplate ? (
        <Card>
          <p className="text-sm text-cfh-muted">正在解析模板骨架，请稍候...</p>
        </Card>
      ) : null}

      {templateParseError ? (
        <Card>
          <p className="text-sm text-rose-600">{templateParseError}</p>
        </Card>
      ) : null}

      <Card title="模板骨架摘要">
        {state.template_outline ? (
          <div className="space-y-2 text-sm">
            <p className="text-cfh-ink">
              文件：<span className="font-medium">{state.template_outline.file_name}</span>
            </p>
            <p className="text-cfh-muted">
              章节数 {state.template_outline.chapter_order.length}，术语数{" "}
              {state.template_outline.terms.length}。
            </p>
            <p className="text-xs text-cfh-muted">
              章节顺序：{state.template_outline.chapter_order.join(" / ")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-cfh-muted">尚未上传模板骨架。</p>
        )}
      </Card>

      <FileUploader
        accept=".csv,text/csv"
        description="导入金标准 CSV。命中词条会在后续流程中锁定正文定义，专家草稿仅作差异对照。"
        disabled={isParsingGold || !state.template_outline}
        disabledReason={!state.template_outline ? "请先上传模板骨架。" : ""}
        filterFiles={(files) => files.filter((file) => file.name.toLowerCase().endsWith(".csv"))}
        multiple={false}
        onFilesSelected={(files) => requestMutation("gold_standard", files)}
        title="导入金标准 CSV"
      />

      {isParsingGold ? (
        <Card>
          <p className="text-sm text-cfh-muted">正在解析金标准 CSV，请稍候...</p>
        </Card>
      ) : null}

      {goldParseError ? (
        <Card>
          <p className="text-sm text-rose-600">{goldParseError}</p>
        </Card>
      ) : null}

      {pendingGoldImport && pendingGoldResolution && state.template_outline ? (
        <GoldStandardImportReview
          decisions={pendingGoldDecisions}
          onAcceptSuggestion={(issueId) =>
            handleSetGoldDecision({
              issue_id: issueId,
              action: "accept_suggestion"
            })
          }
          onCommit={handleCommitGoldImport}
          onDropRow={(issueId) =>
            handleSetGoldDecision({
              issue_id: issueId,
              action: "drop_row"
            })
          }
          onManualMap={(issueId, templateTermId) =>
            handleSetGoldDecision({
              issue_id: issueId,
              action: "manual_map",
              manual_template_term_id: templateTermId
            })
          }
          pendingImport={pendingGoldImport}
          resolution={pendingGoldResolution}
          templateOutline={state.template_outline}
        />
      ) : null}

      <Card title="金标准摘要">
        <div className="space-y-3 text-sm">
          {state.gold_standard_status === "imported" && state.gold_standard_doc ? (
            <>
              <p className="text-cfh-ink">
                文件：<span className="font-medium">{state.gold_standard_doc.file_name}</span>
              </p>
              <p className="text-cfh-muted">
                已导入 {state.gold_standard_entries.length} 条金标准词条。
              </p>
              <p className="text-xs text-cfh-muted">
                命中金标准的模板词条在阶段二不再进入 AI 正文合并，只展示金标准定义与专家差异。
              </p>
            </>
          ) : state.gold_standard_status === "skipped" ? (
            <p className="text-cfh-muted">
              本轮已显式跳过金标准步骤。所有模板词条将按当前模板驱动 + 专家合并流程处理。
            </p>
          ) : (
            <p className="text-cfh-muted">
              尚未完成金标准步骤。请导入金标准 CSV，或明确点击“本轮无金标准 / 跳过”。
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/tools/gold-standard-converter">
              <Button type="button" variant="secondary">
                打开金标准转换工具
              </Button>
            </Link>
            <Button
              disabled={!state.template_outline}
              onClick={() => setSkipGoldConfirmOpen(true)}
              type="button"
              variant="secondary"
            >
              本轮无金标准 / 跳过
            </Button>
          </div>
        </div>
      </Card>

      <FileUploader
        description="上传 8 位专家的术语草案 DOCX。专家稿作为平等内容来源参与模板内工作单元汇总与模板外候选提取。"
        disabled={isParsingDocs || !state.template_outline || !goldStepDone}
        disabledReason={expertDisabledReason}
        onFilesSelected={(files) => requestMutation("experts", files)}
        title="上传专家草案"
      />

      {isParsingDocs ? (
        <Card>
          <p className="text-sm text-cfh-muted">正在解析专家稿，请稍候...</p>
        </Card>
      ) : null}

      {docParseError ? (
        <Card>
          <p className="text-sm text-rose-600">{docParseError}</p>
        </Card>
      ) : null}

      {pendingBatch && pendingResolution ? (
        <DraftCleaningReview
          batch={pendingBatch}
          decisions={pendingDecisions}
          onAcceptCleaning={(issueId) =>
            handleSetDecision({
              issue_id: issueId,
              action: "accept_cleaning"
            })
          }
          onCommit={handleCommitBatch}
          onKeepRaw={(issueId) =>
            handleSetDecision({
              issue_id: issueId,
              action: "keep_raw"
            })
          }
          onManualSave={(issueId, nameCn, nameEn) =>
            handleSetDecision({
              issue_id: issueId,
              action: "manual_edit",
              manual_name_cn: nameCn.trim(),
              manual_name_en: nameEn.trim()
            })
          }
          resolution={pendingResolution}
        />
      ) : null}

      <Card title="专家输入摘要">
        {state.parsed_docs.length > 0 ? (
          <div className="space-y-2 text-sm">
            <p className="text-cfh-muted">已解析 {state.parsed_docs.length} 份专家文档。</p>
            <ul className="space-y-1 text-cfh-ink">
              {state.parsed_docs.map((doc) => (
                <li key={doc.id}>
                  {doc.author} / {doc.file_name} / {doc.terms.length} 条
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-cfh-muted">尚未上传专家草案。</p>
        )}
      </Card>

      {state.template_outline && goldStepDone && state.parsed_docs.length > 0 ? (
        <TermUnitReview
          candidateDecisions={candidateDecisions}
          memberOverrides={memberOverrides}
          onCommit={handleCommitTermUnitReview}
          onResetToAuto={handleResetToAutoUnits}
          onSetCandidateDecision={handleSetCandidateDecision}
          onSetMemberOverride={handleSetMemberOverride}
          parsedDocs={state.parsed_docs}
          reviewed={!reviewMode && state.term_unit_status === "reviewed"}
          templateOutline={state.template_outline}
          units={displayedUnits}
        />
      ) : (
        <Card title="术语工作单元检查">
          <div className="space-y-3 text-sm">
            <p className="text-cfh-muted">{termUnitSummary}</p>
            {!phase2Readiness.ready ? (
              <p className="text-xs text-amber-700">{termUnitActionReason}</p>
            ) : null}
          </div>
        </Card>
      )}

      <Card title="进入阶段二">
        <div className="space-y-3">
          <p className="text-sm text-cfh-muted">
            只有模板、金标准状态、专家稿和术语工作单元检查全部完成后，才能进入阶段二执行全量合并。
          </p>
          {!phase2Readiness.ready ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-rose-700">
              {phase2Readiness.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-700">前置条件已全部完成，可以进入阶段二。</p>
          )}
          <Button
            disabled={!phase2Readiness.ready}
            onClick={() => router.push("/phase2")}
            type="button"
          >
            进入阶段二
          </Button>
        </div>
      </Card>

      <ParsePreview docs={state.parsed_docs} />
      <CoverageMatrix docs={state.parsed_docs} conceptClusters={displayedUnits} />

      <Modal
        open={skipGoldConfirmOpen}
        onClose={() => setSkipGoldConfirmOpen(false)}
        title="确认跳过术语金标准"
      >
        <div className="space-y-4">
          <p className="text-sm text-cfh-muted">
            跳过后，本轮命中模板的词条不会有金标准正文锁定，后续会全部走专家合并逻辑。若当前已完成术语工作单元检查或阶段二结果，这些结果会失效。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirmSkipGoldStandard} type="button">
              确认跳过
            </Button>
            <Button onClick={() => setSkipGoldConfirmOpen(false)} type="button" variant="secondary">
              返回继续导入
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingMutation)}
        onClose={() => setPendingMutation(null)}
        title={pendingMutation?.title ?? "确认变更"}
      >
        <div className="space-y-4">
          <p className="text-sm text-cfh-muted">
            这次操作会让下游结果失效，需要重新执行后续步骤。确认后才会继续导入新文件。
          </p>
          {pendingMutation ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-rose-700">
              {pendingMutation.consequences.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirmPendingMutation} type="button">
              确认继续
            </Button>
            <Button onClick={() => setPendingMutation(null)} type="button" variant="secondary">
              取消
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
