import { callGemini } from "@/lib/gemini";
import { runQualityChecks } from "@/lib/postprocess";
import {
  buildMergePrompt,
  MERGE_RESPONSE_SCHEMA,
  MERGE_SYSTEM_INSTRUCTION
} from "@/lib/prompts";
import { findTemplateTermForCluster } from "@/lib/templateParser";
import type {
  ConceptCluster,
  GoldStandardEntry,
  MergeResult,
  MergeSourceEntry,
  ParsedDoc,
  Segment,
  TemplateOutline
} from "@/lib/types";

const DEFAULT_MODEL = "gemini-3.1-pro-preview";

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function getMergeSourceEntry(
  cluster: ConceptCluster,
  member: ConceptCluster["members"][number],
  parsedDocs: ParsedDoc[]
): MergeSourceEntry {
  const doc = parsedDocs.find((item) => item.author === member.author);
  const termById = doc?.terms.find((term) => term.id === member.term_id);
  const termByName = doc?.terms.find(
    (term) => normalizeText(term.name_cn) === normalizeText(member.term_name)
  );
  const term = termById ?? termByName;

  return {
    author: member.author,
    term_id: member.term_id,
    term_name_cn: term?.name_cn ?? member.term_name,
    term_name_en: term?.name_en ?? "",
    chapter: term?.chapter ?? cluster.suggested_chapter ?? "未分类",
    definition: term?.definition ?? "",
    has_definition: term?.has_definition ?? false
  };
}

interface MergeModelResponse {
  dimensions?: MergeResult["dimensions"];
  segments?: MergeResult["segments"];
  notes?: string;
  excluded_sources?: MergeResult["excluded_sources"];
  reference_items?: string[];
}

function fallbackSegments(sourceEntries: MergeSourceEntry[] = []) {
  const firstDefined = sourceEntries.find((item) => item.has_definition);
  if (!firstDefined?.definition) {
    return [] as Segment[];
  }
  return [
    {
      text: firstDefined.definition,
      source: firstDefined.author
    }
  ];
}

function findGoldStandardEntry(
  cluster: ConceptCluster,
  templateOutline: TemplateOutline,
  goldStandardEntries: GoldStandardEntry[]
) {
  const templateTerm = findTemplateTermForCluster(templateOutline, cluster);
  const templateTermId = cluster.template_term_id ?? templateTerm?.template_term_id;
  if (!templateTermId) {
    return undefined;
  }
  return goldStandardEntries.find((entry) => entry.template_term_id === templateTermId);
}

function createResult(params: {
  cluster: ConceptCluster;
  templateOutline: TemplateOutline;
  sourceEntries: MergeSourceEntry[];
  definitionSource: MergeResult["definition_source"];
  dimensions?: MergeResult["dimensions"];
  segments?: MergeResult["segments"];
  notes?: string;
  excludedSources?: MergeResult["excluded_sources"];
  referenceItems?: string[];
  mergedDefinitionOverride?: string;
  qualityFlagsOverride?: MergeResult["quality_flags"];
  status: MergeResult["status"];
}): MergeResult {
  const {
    cluster,
    templateOutline,
    sourceEntries,
    definitionSource,
    dimensions = [],
    notes = "",
    excludedSources = [],
    referenceItems = [],
    mergedDefinitionOverride,
    qualityFlagsOverride,
    status
  } = params;
  const templateTerm = findTemplateTermForCluster(templateOutline, cluster);
  const segments = params.segments ?? fallbackSegments(sourceEntries);
  const mergedDefinition =
    mergedDefinitionOverride ?? segments.map((segment) => segment.text).join("").trim();
  const qualityFlags =
    qualityFlagsOverride ??
    (mergedDefinition && mergedDefinition !== "待补充"
      ? runQualityChecks({
          termNameCn: cluster.canonical_name_cn || templateTerm?.name_cn || "",
          termNameEn: cluster.canonical_name_en || templateTerm?.name_en || "",
          mergedDefinition
        })
      : []);

  return {
    cluster_id: cluster.cluster_id,
    template_term_id: cluster.template_term_id ?? templateTerm?.template_term_id,
    in_template_scope: cluster.in_template_scope,
    definition_source: definitionSource,
    term_name_cn: cluster.canonical_name_cn || templateTerm?.name_cn || cluster.members[0]?.term_name || cluster.cluster_id,
    term_name_en: cluster.canonical_name_en || templateTerm?.name_en || "",
    chapter:
      templateTerm?.chapter ||
      cluster.suggested_chapter ||
      sourceEntries.find((item) => item.has_definition)?.chapter ||
      "未分类",
    source_entries: sourceEntries,
    dimensions,
    merged_definition: mergedDefinition,
    segments,
    notes,
    excluded_sources: excludedSources,
    quality_flags: qualityFlags,
    reference_items: referenceItems,
    status
  };
}

export interface MergeProgressEvent {
  total: number;
  completed: number;
  success: number;
  failed: number;
  cluster_id: string;
  term_name_cn: string;
  status: "running" | "success" | "failed";
  message: string;
}

interface RunMergerParams {
  apiKey: string;
  parsedDocs: ParsedDoc[];
  templateOutline: TemplateOutline;
  conceptClusters: ConceptCluster[];
  goldStandardEntries?: GoldStandardEntry[];
  model?: string;
  intervalMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  onProgress?: (event: MergeProgressEvent) => void;
}

export async function runMergePipeline({
  apiKey,
  parsedDocs,
  templateOutline,
  conceptClusters,
  goldStandardEntries = [],
  model = DEFAULT_MODEL,
  intervalMs = 500,
  maxAttempts = 3,
  retryBaseMs = 800,
  onProgress
}: RunMergerParams) {
  const clusters = conceptClusters.filter((cluster) => cluster.include_in_scope !== false);
  const total = clusters.length;
  let completed = 0;
  let success = 0;
  let failed = 0;
  const results: Record<string, MergeResult> = {};

  for (let index = 0; index < clusters.length; index += 1) {
    const cluster = clusters[index];

    if (index > 0) {
      await sleep(intervalMs);
    }

    const templateTerm = findTemplateTermForCluster(templateOutline, cluster);
    const termNameCn =
      cluster.canonical_name_cn || templateTerm?.name_cn || cluster.members[0]?.term_name || cluster.cluster_id;

    onProgress?.({
      total,
      completed,
      success,
      failed,
      cluster_id: cluster.cluster_id,
      term_name_cn: termNameCn,
      status: "running",
      message: `开始处理 ${termNameCn}`
    });

    const sourceEntries = cluster.members.map((member) =>
      getMergeSourceEntry(cluster, member, parsedDocs)
    );
    const definedEntries = sourceEntries.filter((entry) => entry.has_definition);
    const goldStandardEntry = findGoldStandardEntry(
      cluster,
      templateOutline,
      goldStandardEntries
    );

    if (goldStandardEntry) {
      const goldResult = createResult({
        cluster: { ...cluster, gold_standard_term: true },
        templateOutline,
        sourceEntries,
        definitionSource: "gold_standard",
        segments: [
          {
            text: goldStandardEntry.standard_definition,
            source: "金标准"
          }
        ],
        mergedDefinitionOverride: goldStandardEntry.standard_definition,
        notes: [
          `金标准来源：${goldStandardEntry.source_doc}。`,
          "该词条正文由金标准锁定，专家原文仅作差异对照。",
          goldStandardEntry.notes ?? ""
        ]
          .filter(Boolean)
          .join(" "),
        referenceItems: [
          `金标准来源：${goldStandardEntry.source_doc}`,
          ...(goldStandardEntry.source_excerpt
            ? [`来源摘录：${goldStandardEntry.source_excerpt}`]
            : [])
        ],
        qualityFlagsOverride: goldStandardEntry.quality_flags,
        status: "ai_merged"
      });
      results[cluster.cluster_id] = goldResult;
      completed += 1;
      success += 1;
      onProgress?.({
        total,
        completed,
        success,
        failed,
        cluster_id: cluster.cluster_id,
        term_name_cn: termNameCn,
        status: "success",
        message: `${termNameCn} 完成（金标准覆盖）`
      });
      continue;
    }

    if (definedEntries.length === 0) {
      const failedResult = createResult({
        cluster,
        templateOutline,
        sourceEntries,
        definitionSource: "missing",
        mergedDefinitionOverride: cluster.in_template_scope ? "待补充" : "",
        notes: cluster.in_template_scope
          ? "模板内词条暂无专家定义，标记为待补充。"
          : "模板外词条暂无可用定义，标记为人工处理。",
        status: "ai_failed"
      });
      results[cluster.cluster_id] = failedResult;
      completed += 1;
      failed += 1;
      onProgress?.({
        total,
        completed,
        success,
        failed,
        cluster_id: cluster.cluster_id,
        term_name_cn: termNameCn,
        status: "failed",
        message: `${termNameCn} 失败（缺少可用定义）`
      });
      continue;
    }

    if (definedEntries.length === 1) {
      const [onlyDefined] = definedEntries;
      const result = createResult({
        cluster,
        templateOutline,
        sourceEntries,
        definitionSource: "single_expert",
        segments: [
          {
            text: onlyDefined.definition,
            source: onlyDefined.author
          }
        ],
        notes: `仅 ${onlyDefined.author} 有定义，直接采用该来源原文并执行质量检查。`,
        status: "ai_merged"
      });
      results[cluster.cluster_id] = result;
      completed += 1;
      success += 1;
      onProgress?.({
        total,
        completed,
        success,
        failed,
        cluster_id: cluster.cluster_id,
        term_name_cn: termNameCn,
        status: "success",
        message: `${termNameCn} 完成（单一来源定义）`
      });
      continue;
    }

    let mergedResult: MergeResult | null = null;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (attempt > 1) {
          const waitMs = retryBaseMs * 2 ** (attempt - 2);
          onProgress?.({
            total,
            completed,
            success,
            failed,
            cluster_id: cluster.cluster_id,
            term_name_cn: termNameCn,
            status: "running",
            message: `${termNameCn} 第 ${attempt} 次重试前等待 ${waitMs}ms`
          });
          await sleep(waitMs);
        }

        const prompt = buildMergePrompt({
          clusterId: cluster.cluster_id,
          canonicalNameCn: cluster.canonical_name_cn,
          canonicalNameEn: cluster.canonical_name_en,
          templateTerm,
          terms: sourceEntries
        });

        const response = await callGemini<MergeModelResponse>({
          apiKey,
          model,
          prompt,
          systemInstruction: MERGE_SYSTEM_INSTRUCTION,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: MERGE_RESPONSE_SCHEMA
          },
          retries: 0
        });

        mergedResult = createResult({
          cluster,
          templateOutline,
          sourceEntries,
          definitionSource: "expert_merge",
          dimensions: Array.isArray(response.dimensions) ? response.dimensions : [],
          segments: Array.isArray(response.segments) ? response.segments : [],
          notes: response.notes ?? "",
          excludedSources: Array.isArray(response.excluded_sources) ? response.excluded_sources : [],
          referenceItems: Array.isArray(response.reference_items) ? response.reference_items : [],
          status: "ai_merged"
        });
        break;
      } catch (error) {
        lastError = error;
        onProgress?.({
          total,
          completed,
          success,
          failed,
          cluster_id: cluster.cluster_id,
          term_name_cn: termNameCn,
          status: "running",
          message: `${termNameCn} 调用失败（第 ${attempt}/${maxAttempts} 次）`
        });
      }
    }

    if (mergedResult) {
      results[cluster.cluster_id] = mergedResult;
      completed += 1;
      success += 1;
      onProgress?.({
        total,
        completed,
        success,
        failed,
        cluster_id: cluster.cluster_id,
        term_name_cn: termNameCn,
        status: "success",
        message: `${termNameCn} 合并完成`
      });
    } else {
      console.error("合并失败：", cluster.cluster_id, lastError);
      results[cluster.cluster_id] = createResult({
        cluster,
        templateOutline,
        sourceEntries,
        definitionSource: "expert_merge",
        notes: "AI 多次调用失败，需人工处理。",
        status: "ai_failed"
      });
      completed += 1;
      failed += 1;
      onProgress?.({
        total,
        completed,
        success,
        failed,
        cluster_id: cluster.cluster_id,
        term_name_cn: termNameCn,
        status: "failed",
        message: `${termNameCn} 合并失败，已标记 ai_failed`
      });
    }
  }

  return results;
}
