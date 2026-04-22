"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CoverageMatrix } from "@/components/phase1/CoverageMatrix";
import { DraftCleaningReview } from "@/components/phase1/DraftCleaningReview";
import { FileUploader } from "@/components/phase1/FileUploader";
import { GoldStandardImportReview } from "@/components/phase1/GoldStandardImportReview";
import { ParsePreview } from "@/components/phase1/ParsePreview";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  buildPendingImportBatch,
  resolvePendingImportBatch
} from "@/lib/draftImport";
import {
  buildPendingGoldStandardImport,
  resolvePendingGoldStandardImport
} from "@/lib/goldStandard";
import { parseTemplateDocx } from "@/lib/templateParser";
import type {
  DraftCleaningDecision,
  GoldStandardImportDecision,
  ParsedDoc,
  PendingImportBatch,
  PendingGoldStandardImport
} from "@/lib/types";
import { useAppContext } from "@/store/AppContext";

export default function Phase1Page() {
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

  const handleTemplateSelected = async (files: File[]) => {
    const [file] = files;
    if (!file) {
      return;
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
    } catch (error) {
      console.error(error);
      setTemplateParseError("模板解析失败，请检查 DOCX 文件结构后重试。");
    } finally {
      setIsParsingTemplate(false);
    }
  };

  const handleGoldStandardSelected = async (files: File[]) => {
    const [file] = files;
    if (!file || !state.template_outline) {
      setGoldParseError("请先上传模板骨架，再导入金标准 CSV。");
      return;
    }

    setGoldParseError("");
    setIsParsingGold(true);
    try {
      const pendingImport = await buildPendingGoldStandardImport(file, state.template_outline);
      setPendingGoldImport(pendingImport);
      setPendingGoldDecisions({});
    } catch (error) {
      console.error(error);
      setGoldParseError(
        error instanceof Error ? error.message : "金标准 CSV 解析失败，请检查文件格式后重试。"
      );
    } finally {
      setIsParsingGold(false);
    }
  };

  const handleExpertFilesSelected = async (files: File[]) => {
    if (!state.template_outline) {
      setDocParseError("请先上传模板骨架，再导入专家草稿。");
      return;
    }

    setDocParseError("");
    setIsParsingDocs(true);

    try {
      const batch = await buildPendingImportBatch(files, state.template_outline);
      setPendingBatch(batch);
      setPendingDecisions({});
    } catch (error) {
      console.error(error);
      setDocParseError("专家稿解析失败，请检查 DOCX 文件结构后重试。");
    } finally {
      setIsParsingDocs(false);
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

  return (
    <div className="space-y-4">
      <FileUploader
        description="先上传 1 份模板骨架 DOCX。模板只决定章节结构和术语范围，不参与定义合并。"
        disabled={isParsingTemplate}
        multiple={false}
        onFilesSelected={handleTemplateSelected}
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
        filterFiles={(files) => files.filter((file) => file.name.toLowerCase().endsWith(".csv"))}
        multiple={false}
        onFilesSelected={handleGoldStandardSelected}
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
          {state.gold_standard_doc ? (
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
          ) : (
            <p className="text-cfh-muted">
              尚未导入金标准 CSV。没有金标准时，所有模板词条仍按当前模板驱动 + 专家合并流程处理。
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/tools/gold-standard-converter">
              <Button type="button" variant="secondary">
                打开金标准转换工具
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <FileUploader
        description="上传 8 位专家的术语草案 DOCX。专家稿作为平等内容来源参与概念对齐与定义合并。"
        disabled={isParsingDocs || !state.template_outline}
        onFilesSelected={handleExpertFilesSelected}
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

      <ParsePreview docs={state.parsed_docs} />
      <CoverageMatrix docs={state.parsed_docs} conceptClusters={state.concept_clusters} />
    </div>
  );
}
