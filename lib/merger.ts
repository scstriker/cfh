import { callGemini } from "@/lib/gemini";
import {
  buildMergePrompt,
  MERGE_RESPONSE_SCHEMA,
  MERGE_SYSTEM_INSTRUCTION
} from "@/lib/prompts";
import type {
  ConceptCluster,
  MergeResult,
  MergeSourceEntry,
  ParsedDoc,
  Segment
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
  dimensions: MergeResult["dimensions"];
  segments: MergeResult["segments"];
  notes: string;
}

function fallbackSegments(primaryTerm?: MergeSourceEntry, sourceEntries: MergeSourceEntry[] = []) {
  const fallback = primaryTerm?.definition || sourceEntries.find((item) => item.has_definition)?.definition || "";
  if (!fallback) {
    return [] as Segment[];
  }
  return [
    {
      text: fallback,
      source: primaryTerm?.author || sourceEntries.find((item) => item.has_definition)?.author || "未知来源"
    }
  ];
}

function createResult(params: {
  cluster: ConceptCluster;
  sourceEntries: MergeSourceEntry[];
  primaryTerm?: MergeSourceEntry;
  dimensions?: MergeResult["dimensions"];
  segments?: MergeResult["segments"];
  notes?: string;
  status: MergeResult["status"];
}): MergeResult {
  const { cluster, sourceEntries, primaryTerm, dimensions = [], notes = "", status } = params;
  const segments = params.segments ?? fallbackSegments(primaryTerm, sourceEntries);
  const mergedDefinition = segments.map((segment) => segment.text).join("").trim();

  return {
    cluster_id: cluster.cluster_id,
    term_name_cn: cluster.canonical_name_cn || cluster.members[0]?.term_name || cluster.cluster_id,
    term_name_en: cluster.canonical_name_en || "",
    chapter:
      primaryTerm?.chapter || sourceEntries.find((item) => item.has_definition)?.chapter || cluster.suggested_chapter || "未分类",
    source_entries: sourceEntries,
    primary_term: primaryTerm,
    dimensions,
    merged_definition: mergedDefinition,
    segments,
    notes,
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
  conceptClusters: ConceptCluster[];
  primaryAuthor: string;
  model?: string;
  intervalMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  onProgress?: (event: MergeProgressEvent) => void;
}

export async function runMergePipeline({
  apiKey,
  parsedDocs,
  conceptClusters,
  primaryAuthor,
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

    const termNameCn = cluster.canonical_name_cn || cluster.members[0]?.term_name || cluster.cluster_id;
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
    const primaryTerm = sourceEntries.find((entry) => entry.author === primaryAuthor);
    const definedCount = sourceEntries.filter((entry) => entry.has_definition).length;
    const hasPrimaryDefinition = Boolean(primaryTerm?.has_definition);
    const hasOtherDefinition = sourceEntries.some(
      (entry) => entry.author !== primaryAuthor && entry.has_definition
    );

    if (hasPrimaryDefinition && !hasOtherDefinition) {
      const result = createResult({
        cluster,
        sourceEntries,
        primaryTerm,
        notes: "仅主稿有定义，直接采用主稿原文。",
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
        message: `${termNameCn} 完成（仅主稿有定义）`
      });
      continue;
    }

    if (definedCount === 0) {
      const failedResult = createResult({
        cluster,
        sourceEntries,
        primaryTerm,
        notes: "所有来源均无有效定义，标记为人工处理。",
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

    if (definedCount === 1) {
      const onlyDefined = sourceEntries.find((entry) => entry.has_definition);
      const result = createResult({
        cluster,
        sourceEntries,
        primaryTerm: primaryTerm ?? onlyDefined,
        notes: `仅 ${onlyDefined?.author ?? "单一来源"} 有定义，直接采用该来源原文。`,
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
          primaryAuthor,
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
          sourceEntries,
          primaryTerm,
          dimensions: Array.isArray(response.dimensions) ? response.dimensions : [],
          segments: Array.isArray(response.segments) ? response.segments : [],
          notes: response.notes ?? "",
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
        sourceEntries,
        primaryTerm,
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
