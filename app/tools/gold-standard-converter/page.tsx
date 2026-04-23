"use client";

import { saveAs } from "file-saver";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FileUploader } from "@/components/phase1/FileUploader";
import { callGemini } from "@/lib/gemini";
import { serializeGoldStandardCsv } from "@/lib/goldStandard";
import { extractTextFromPdfBuffer } from "@/lib/pdfText";
import {
  buildGoldStandardConversionPrompt,
  GOLD_STANDARD_CONVERSION_RESPONSE_SCHEMA,
  GOLD_STANDARD_CONVERSION_SYSTEM_INSTRUCTION,
  type GoldStandardConversionResponse
} from "@/lib/prompts";
import { runQualityChecks } from "@/lib/postprocess";
import { requiresUserGeminiApiKey } from "@/lib/runtimeMode";
import type { GoldStandardEntry, QualityFlag } from "@/lib/types";
import { useAppContext } from "@/store/AppContext";

type ConverterCandidate = GoldStandardEntry & {
  candidate_id: string;
  include_in_export: boolean;
};

const QUALITY_FLAG_LABELS: Record<QualityFlag, string> = {
  sentence_form: "句式不完整",
  logic_order: "逻辑顺序可疑",
  circular_definition: "循环定义",
  too_long: "定义过长",
  clause_too_long: "从句过长",
  abbreviation: "含未展开缩写",
  grammar: "疑似病句"
};

function buildCandidate(
  entry: GoldStandardConversionResponse["entries"][number],
  templateTerm: {
    template_term_id: string;
    chapter: string;
    name_cn: string;
    name_en: string;
  },
  sourceDocName: string
): ConverterCandidate {
  return {
    candidate_id: `${templateTerm.template_term_id}-${crypto.randomUUID()}`,
    template_term_id: templateTerm.template_term_id,
    chapter: templateTerm.chapter,
    term_name_cn: templateTerm.name_cn,
    term_name_en: templateTerm.name_en,
    source_doc: sourceDocName,
    source_excerpt: entry.source_excerpt.trim(),
    standard_definition: entry.standard_definition.trim(),
    notes: entry.notes?.trim() || undefined,
    quality_flags: runQualityChecks({
      termNameCn: templateTerm.name_cn,
      termNameEn: templateTerm.name_en,
      mergedDefinition: entry.standard_definition.trim()
    }),
    imported_at: new Date().toISOString(),
    include_in_export: true
  };
}

export default function GoldStandardConverterPage() {
  const { state } = useAppContext();
  const [sourceFileName, setSourceFileName] = useState("百问百答.pdf");
  const [sourceText, setSourceText] = useState("");
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unmatchedExcerpts, setUnmatchedExcerpts] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<ConverterCandidate[]>([]);

  const exportableCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.include_in_export && candidate.quality_flags.length === 0),
    [candidates]
  );

  const handlePdfSelected = async (files: File[]) => {
    const [file] = files;
    if (!file) {
      return;
    }

    setIsExtractingPdf(true);
    setError("");
    setMessage("");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const extractedText = await extractTextFromPdfBuffer(arrayBuffer);
      setSourceFileName(file.name);
      setSourceText(extractedText);
      setMessage(`已从 ${file.name} 提取文本，可直接生成候选或继续人工清洗。`);
    } catch (extractError) {
      console.error(extractError);
      setError("PDF 文本提取失败，请改用“粘贴提取文本”兜底入口。");
    } finally {
      setIsExtractingPdf(false);
    }
  };

  const handleGenerate = async () => {
    if (!state.template_outline) {
      setError("请先在阶段一上传模板骨架。");
      return;
    }
    if (requiresUserGeminiApiKey() && !state.api_key.trim()) {
      setError("请先填写 Gemini API Key。");
      return;
    }
    if (!sourceText.trim()) {
      setError("请先上传 PDF 或粘贴源文本。");
      return;
    }

    setIsGenerating(true);
    setError("");
    setMessage("");
    try {
      const response = await callGemini<GoldStandardConversionResponse>({
        apiKey: state.api_key,
        model: "gemini-3.1-pro-preview",
        prompt: buildGoldStandardConversionPrompt({
          sourceDocName: sourceFileName,
          sourceText,
          templateOutline: state.template_outline
        }),
        systemInstruction: GOLD_STANDARD_CONVERSION_SYSTEM_INSTRUCTION,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: GOLD_STANDARD_CONVERSION_RESPONSE_SCHEMA
        }
      });

      const templateById = new Map(
        state.template_outline.terms.map((term) => [term.template_term_id, term])
      );
      const deduped = new Map<string, ConverterCandidate>();
      const invalidEntries: string[] = [];

      response.entries.forEach((entry) => {
        const templateTerm = templateById.get(entry.template_term_id);
        if (!templateTerm) {
          invalidEntries.push(
            `模型返回了不存在的 template_term_id：${entry.template_term_id}，已丢弃。`
          );
          return;
        }

        const nextCandidate = buildCandidate(entry, templateTerm, sourceFileName);
        const existing = deduped.get(templateTerm.template_term_id);
        if (!existing) {
          deduped.set(templateTerm.template_term_id, nextCandidate);
          return;
        }

        deduped.set(templateTerm.template_term_id, {
          ...nextCandidate,
          candidate_id: existing.candidate_id,
          source_excerpt: `${existing.source_excerpt}\n---\n${nextCandidate.source_excerpt}`,
          notes: [existing.notes, nextCandidate.notes, "模型返回重复候选，已合并摘录。"]
            .filter(Boolean)
            .join(" ")
        });
      });

      setCandidates(Array.from(deduped.values()));
      setUnmatchedExcerpts([
        ...response.unmatched_excerpts.filter((item) => item.trim().length > 0),
        ...invalidEntries
      ]);
      setMessage(`已生成 ${deduped.size} 条金标准候选，请逐条检查后导出 CSV。`);
    } catch (generationError) {
      console.error(generationError);
      setError(
        requiresUserGeminiApiKey()
          ? "候选生成失败，请检查 API Key、网络或源文本后重试。"
          : "候选生成失败，请检查网络、云端代理或源文本后重试。"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCandidateChange = (
    candidateId: string,
    patch: Partial<Pick<ConverterCandidate, "include_in_export" | "notes" | "source_excerpt" | "standard_definition">>
  ) => {
    setCandidates((current) =>
      current.map((candidate) => {
        if (candidate.candidate_id !== candidateId) {
          return candidate;
        }

        const next = {
          ...candidate,
          ...patch
        };
        const nextDefinition = next.standard_definition.trim();
        return {
          ...next,
          standard_definition: nextDefinition,
          quality_flags: runQualityChecks({
            termNameCn: next.term_name_cn,
            termNameEn: next.term_name_en,
            mergedDefinition: nextDefinition
          })
        };
      })
    );
  };

  const handleExportCsv = () => {
    if (exportableCandidates.length === 0) {
      setMessage("当前没有可导出的候选，请先修复质量告警或勾选候选。");
      return;
    }

    const csvText = serializeGoldStandardCsv(exportableCandidates);
    const blob = new Blob([`\uFEFF${csvText}`], { type: "text/csv;charset=utf-8" });
    saveAs(blob, "gold_standard_entries.csv");
    setMessage(`已导出 ${exportableCandidates.length} 条金标准 CSV，可回到阶段一导入。`);
  };

  return (
    <div className="space-y-4">
      <Card title="金标准转换工具">
        <div className="space-y-3 text-sm">
          <p className="text-cfh-muted">
            将百问百答这类非标准写法材料转换为可导入主流程的金标准 CSV。运行前需保证当前会话已加载模板骨架，
            {requiresUserGeminiApiKey()
              ? "并填写 Gemini API Key。"
              : "并确保云端代理可用。"}
          </p>
          <p className="text-xs text-cfh-muted">
            规则来源已固化在仓库中：标准定义写法由 Prompt 合约 + 本地质量校验共同约束，不在运行时动态读取其他国标 PDF。
          </p>
        </div>
      </Card>

      <Card title="步骤一：准备源材料">
        <div className="space-y-4">
          <FileUploader
            accept=".pdf,application/pdf"
            description="上传 1 份 PDF。若 PDF 解析失败，可直接在下方粘贴提取文本继续。"
            disabled={isExtractingPdf}
            filterFiles={(files) => files.filter((file) => file.name.toLowerCase().endsWith(".pdf"))}
            multiple={false}
            onFilesSelected={handlePdfSelected}
            title="上传源 PDF"
          />
          <label className="block text-xs text-cfh-muted">
            源文件名
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-cfh-ink"
              onChange={(event) => setSourceFileName(event.target.value)}
              value={sourceFileName}
            />
          </label>
          <label className="block text-xs text-cfh-muted">
            提取文本 / 手动粘贴文本
            <textarea
              className="mt-1 h-72 w-full rounded-md border border-slate-200 bg-white p-3 text-sm text-cfh-ink outline-none ring-cfh-accent focus:ring-2"
              onChange={(event) => setSourceText(event.target.value)}
              value={sourceText}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={isGenerating || isExtractingPdf} onClick={handleGenerate} type="button">
              {isGenerating ? "生成候选中..." : "生成金标准候选"}
            </Button>
            <Button onClick={handleExportCsv} type="button" variant="secondary">
              导出 CSV
            </Button>
          </div>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {message ? <p className="text-sm text-cfh-ink">{message}</p> : null}
        </div>
      </Card>

      <Card title="步骤二：候选检查">
        {candidates.length === 0 ? (
          <p className="text-sm text-cfh-muted">尚未生成候选。</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-cfh-muted">
              共 {candidates.length} 条候选，可导出 {exportableCandidates.length} 条。
            </p>
            {candidates.map((candidate) => (
              <div key={candidate.candidate_id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-cfh-ink">
                      {candidate.term_name_cn}
                      {candidate.term_name_en ? ` / ${candidate.term_name_en}` : ""}
                    </p>
                    <p className="text-xs text-cfh-muted">
                      {candidate.template_term_id} · {candidate.chapter}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-cfh-muted">
                    <input
                      checked={candidate.include_in_export}
                      onChange={(event) =>
                        handleCandidateChange(candidate.candidate_id, {
                          include_in_export: event.target.checked
                        })
                      }
                      type="checkbox"
                    />
                    纳入导出
                  </label>
                </div>

                <div className="mt-3 space-y-3">
                  <label className="block text-xs text-cfh-muted">
                    标准定义
                    <textarea
                      className="mt-1 h-28 w-full rounded-md border border-slate-200 bg-white p-3 text-sm text-cfh-ink outline-none ring-cfh-accent focus:ring-2"
                      onChange={(event) =>
                        handleCandidateChange(candidate.candidate_id, {
                          standard_definition: event.target.value
                        })
                      }
                      value={candidate.standard_definition}
                    />
                  </label>

                  <label className="block text-xs text-cfh-muted">
                    来源摘录
                    <textarea
                      className="mt-1 h-28 w-full rounded-md border border-slate-200 bg-white p-3 text-sm text-cfh-ink outline-none ring-cfh-accent focus:ring-2"
                      onChange={(event) =>
                        handleCandidateChange(candidate.candidate_id, {
                          source_excerpt: event.target.value
                        })
                      }
                      value={candidate.source_excerpt}
                    />
                  </label>

                  <label className="block text-xs text-cfh-muted">
                    备注
                    <textarea
                      className="mt-1 h-20 w-full rounded-md border border-slate-200 bg-white p-3 text-sm text-cfh-ink outline-none ring-cfh-accent focus:ring-2"
                      onChange={(event) =>
                        handleCandidateChange(candidate.candidate_id, {
                          notes: event.target.value
                        })
                      }
                      value={candidate.notes ?? ""}
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    {candidate.quality_flags.length === 0 ? (
                      <Badge tone="success">质量校验通过</Badge>
                    ) : (
                      candidate.quality_flags.map((flag) => (
                        <Badge key={flag} tone="warning">
                          {QUALITY_FLAG_LABELS[flag]}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="步骤三：未匹配内容">
        {unmatchedExcerpts.length === 0 ? (
          <p className="text-sm text-cfh-muted">当前没有未匹配内容。</p>
        ) : (
          <div className="space-y-3">
            {unmatchedExcerpts.map((excerpt, index) => (
              <div key={`${excerpt}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="whitespace-pre-wrap text-sm text-cfh-ink">{excerpt}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
