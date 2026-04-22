"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClusterCard } from "@/components/phase0/ClusterCard";
import { OrphanTermPanel } from "@/components/phase0/OrphanTermPanel";
import { CoverageMatrix } from "@/components/phase1/CoverageMatrix";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { callGemini } from "@/lib/gemini";
import { normalizeMappingType } from "@/lib/mappingType";
import { buildPreclusters, formatPreclusterSummary } from "@/lib/precluster";
import {
  buildAlignmentPrompt,
  ALIGNMENT_RESPONSE_SCHEMA,
  ALIGNMENT_SYSTEM_INSTRUCTION,
  type AlignmentResponse
} from "@/lib/prompts";
import type { ConceptCluster, MappingType, TemplateOutline } from "@/lib/types";
import {
  findTemplateTermById,
  findTemplateTermForCluster
} from "@/lib/templateParser";
import { useAppContext } from "@/store/AppContext";

function normalizeClusters(
  payload: AlignmentResponse,
  templateOutline: TemplateOutline,
  goldStandardTemplateIds: Set<string>
): ConceptCluster[] {
  const normalized = (payload.concept_clusters ?? []).map((cluster, index) => {
    const fallbackCluster = {
      template_term_id: cluster.template_term_id,
      canonical_name_cn: cluster.canonical_name_cn ?? "",
      canonical_name_en: cluster.canonical_name_en ?? "",
      aliases: cluster.aliases ?? [],
      members: cluster.members ?? []
    };
    const matchedTemplateTerm =
      findTemplateTermById(templateOutline, cluster.template_term_id) ??
      findTemplateTermForCluster(templateOutline, fallbackCluster);

    return {
      cluster_id: cluster.cluster_id || `C${String(index + 1).padStart(3, "0")}`,
      canonical_name_cn: cluster.canonical_name_cn || matchedTemplateTerm?.name_cn || "",
      canonical_name_en: cluster.canonical_name_en || matchedTemplateTerm?.name_en || "",
      members: cluster.members ?? [],
      aliases:
        cluster.aliases && cluster.aliases.length > 0
          ? cluster.aliases
          : Array.from(new Set((cluster.members ?? []).map((member) => member.term_name))).filter(
              (name) => name.trim().length > 0
            ),
      is_orphan: Boolean(cluster.is_orphan),
      in_template_scope:
        typeof cluster.in_template_scope === "boolean"
          ? cluster.in_template_scope
          : Boolean(matchedTemplateTerm),
      template_term_id: cluster.template_term_id ?? matchedTemplateTerm?.template_term_id,
      gold_standard_term: matchedTemplateTerm
        ? goldStandardTemplateIds.has(matchedTemplateTerm.template_term_id)
        : false,
      confidence:
        typeof cluster.confidence === "number"
          ? Math.max(0, Math.min(1, cluster.confidence))
          : undefined,
      rationale: cluster.rationale ?? "",
      mapping_type: normalizeMappingType(cluster.mapping_type),
      include_in_scope: true,
      suggested_chapter: cluster.suggested_chapter ?? matchedTemplateTerm?.chapter ?? "",
      mounting_reason: cluster.mounting_reason ?? ""
    };
  });

  const existingTemplateIds = new Set(
    normalized
      .map((cluster) => cluster.template_term_id)
      .filter((templateTermId): templateTermId is string => Boolean(templateTermId))
  );

  const missingTemplateClusters = templateOutline.terms
    .filter((term) => !existingTemplateIds.has(term.template_term_id))
    .map((term, index) => ({
      cluster_id: `TM${String(index + 1).padStart(3, "0")}`,
      canonical_name_cn: term.name_cn,
      canonical_name_en: term.name_en,
      members: [],
      aliases: [],
      is_orphan: false,
      in_template_scope: true,
      template_term_id: term.template_term_id,
      gold_standard_term: goldStandardTemplateIds.has(term.template_term_id),
      confidence: undefined,
      rationale: "模板骨架补齐",
      mapping_type: undefined,
      include_in_scope: true,
      suggested_chapter: term.chapter,
      mounting_reason: ""
    }));

  return [...normalized, ...missingTemplateClusters];
}

function createClusterId() {
  return `C${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;
}

export default function Phase0Page() {
  const router = useRouter();
  const { state, dispatch } = useAppContext();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const locked = state.phase0_locked;

  const updateClusters = (next: ConceptCluster[]) => {
    dispatch({ type: "SET_CONCEPT_CLUSTERS", payload: next });
  };

  const runAlignment = async () => {
    if (!state.api_key.trim()) {
      setError("请先在顶栏填写 Gemini API Key。");
      return;
    }
    if (!state.template_outline) {
      setError("请先在阶段一上传模板骨架。");
      return;
    }
    if (state.parsed_docs.length === 0) {
      setError("请先在阶段一上传并解析文档。");
      return;
    }

    setError("");
    setRunning(true);
    try {
      const preclusterResult = buildPreclusters(state.parsed_docs);
      console.info(formatPreclusterSummary(preclusterResult));

      const prompt = buildAlignmentPrompt({
        parsedDocs: state.parsed_docs,
        templateOutline: state.template_outline,
        goldStandardEntries: state.gold_standard_entries,
        preclusterCandidates: preclusterResult.candidates,
        preclusterGroups: preclusterResult.groups
      });
      const result = await callGemini<AlignmentResponse>({
        apiKey: state.api_key,
        model: "gemini-3.1-pro-preview",
        prompt,
        systemInstruction: ALIGNMENT_SYSTEM_INSTRUCTION,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: ALIGNMENT_RESPONSE_SCHEMA
        }
      });
      const clusters = normalizeClusters(
        result,
        state.template_outline,
        new Set(state.gold_standard_entries.map((entry) => entry.template_term_id))
      );
      updateClusters(clusters);
      setSelectedIds([]);
    } catch (alignmentError) {
      console.error(alignmentError);
      setError("概念对齐失败，请检查 API Key、网络或输入数据后重试。");
    } finally {
      setRunning(false);
    }
  };

  const toggleSelect = (clusterId: string) => {
    if (locked) return;
    setSelectedIds((prev) =>
      prev.includes(clusterId) ? prev.filter((item) => item !== clusterId) : [...prev, clusterId]
    );
  };

  const updateName = (clusterId: string, nameCn: string, nameEn: string) => {
    if (locked) return;
    updateClusters(
      state.concept_clusters.map((cluster) =>
        cluster.cluster_id === clusterId
          ? { ...cluster, canonical_name_cn: nameCn, canonical_name_en: nameEn }
          : cluster
      )
    );
  };

  const updateMappingType = (clusterId: string, mappingType: MappingType) => {
    if (locked) return;
    updateClusters(
      state.concept_clusters.map((cluster) =>
        cluster.cluster_id === clusterId ? { ...cluster, mapping_type: mappingType } : cluster
      )
    );
  };

  const splitMember = (clusterId: string, termId: string) => {
    if (locked) return;
    const cluster = state.concept_clusters.find((item) => item.cluster_id === clusterId);
    if (!cluster) return;

    const member = cluster.members.find((item) => item.term_id === termId);
    if (!member) return;

    const restMembers = cluster.members.filter((item) => item.term_id !== termId);
    const next = state.concept_clusters
      .map((item) => (item.cluster_id === clusterId ? { ...item, members: restMembers } : item))
      .filter((item) => item.members.length > 0);

    next.push({
      cluster_id: createClusterId(),
      canonical_name_cn: member.term_name,
      canonical_name_en: "",
      members: [member],
      aliases: [member.term_name],
      is_orphan: true,
      in_template_scope: false,
      template_term_id: undefined,
      confidence: cluster.confidence,
      rationale: "从原簇拆分",
      mapping_type: normalizeMappingType(cluster.mapping_type),
      include_in_scope: true,
      suggested_chapter: cluster.suggested_chapter,
      mounting_reason: "从原簇拆分"
    });
    updateClusters(next);
  };

  const mergeSelected = () => {
    if (locked) return;
    if (selectedIds.length < 2) return;

    const selected = state.concept_clusters.filter((cluster) => selectedIds.includes(cluster.cluster_id));
    if (selected.length < 2) return;

    const [head, ...tail] = selected;
    const mergedMembers = new Map<string, ConceptCluster["members"][number]>();
    selected.forEach((cluster) => {
      cluster.members.forEach((member) => {
        mergedMembers.set(`${member.author}::${member.term_id}`, member);
      });
    });

    const merged: ConceptCluster = {
      ...head,
      members: Array.from(mergedMembers.values()),
      is_orphan: selected.every((cluster) => cluster.is_orphan),
      in_template_scope: selected.some((cluster) => cluster.in_template_scope),
      template_term_id: selected.find((cluster) => cluster.template_term_id)?.template_term_id,
      gold_standard_term: selected.some((cluster) => cluster.gold_standard_term),
      include_in_scope: selected.some((cluster) => cluster.include_in_scope ?? true)
    };

    const removeIds = new Set(tail.map((cluster) => cluster.cluster_id));
    const next = state.concept_clusters
      .filter((cluster) => !removeIds.has(cluster.cluster_id))
      .map((cluster) => (cluster.cluster_id === head.cluster_id ? merged : cluster));
    updateClusters(next);
    setSelectedIds([head.cluster_id]);
  };

  const toggleOrphanInclude = (clusterId: string, include: boolean) => {
    if (locked) return;
    updateClusters(
      state.concept_clusters.map((cluster) =>
        cluster.cluster_id === clusterId ? { ...cluster, include_in_scope: include } : cluster
      )
    );
  };

  const updateOrphanChapter = (clusterId: string, chapter: string) => {
    if (locked) return;
    updateClusters(
      state.concept_clusters.map((cluster) =>
        cluster.cluster_id === clusterId ? { ...cluster, suggested_chapter: chapter } : cluster
      )
    );
  };

  return (
    <div className="space-y-4">
      <Card title="阶段零：概念对齐与架构映射">
        <div className="space-y-3">
          <p className="text-sm text-cfh-muted">
            使用 Gemini 3.1 Pro 对所有专家术语进行语义聚类，输出概念映射和孤儿词条挂载建议。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={running || locked} onClick={runAlignment} type="button">
              {running ? "对齐处理中..." : "开始概念对齐（3.1 Pro）"}
            </Button>
            <Button
              disabled={locked || selectedIds.length < 2}
              onClick={mergeSelected}
              type="button"
              variant="secondary"
            >
              合并选中簇
            </Button>
            <Button
              disabled={state.concept_clusters.length === 0}
              onClick={() => {
                dispatch({ type: "SET_PHASE0_LOCKED", payload: true });
                router.push("/phase2");
              }}
              type="button"
              variant="secondary"
            >
              确认并进入阶段二
            </Button>
          </div>
          <p className="text-xs text-cfh-muted">
            当前：{state.concept_clusters.length} 个概念簇，已选择 {selectedIds.length} 个用于合并。
          </p>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
      </Card>

      <OrphanTermPanel
        clusters={state.concept_clusters}
        onToggleInclude={toggleOrphanInclude}
        onUpdateChapter={updateOrphanChapter}
      />

      <CoverageMatrix docs={state.parsed_docs} conceptClusters={state.concept_clusters} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {state.concept_clusters.map((cluster) => (
          <ClusterCard
            key={cluster.cluster_id}
            cluster={cluster}
            locked={locked}
            onSplitMember={splitMember}
            onToggleSelect={toggleSelect}
            onUpdateMappingType={updateMappingType}
            onUpdateName={updateName}
            selected={selectedIds.includes(cluster.cluster_id)}
          />
        ))}
      </div>
    </div>
  );
}
