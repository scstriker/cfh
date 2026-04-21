"use client";

import { MAPPING_TYPES, type ConceptCluster, type MappingType } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface ClusterCardProps {
  cluster: ConceptCluster;
  selected: boolean;
  locked: boolean;
  onToggleSelect: (clusterId: string) => void;
  onUpdateName: (clusterId: string, nameCn: string, nameEn: string) => void;
  onUpdateMappingType: (clusterId: string, mappingType: MappingType) => void;
  onSplitMember: (clusterId: string, termId: string) => void;
}

export function ClusterCard({
  cluster,
  selected,
  locked,
  onToggleSelect,
  onUpdateName,
  onUpdateMappingType,
  onSplitMember
}: ClusterCardProps) {
  const confidenceLabel =
    typeof cluster.confidence === "number"
      ? `${Math.round(cluster.confidence * 100)}%`
      : "未提供";

  const mappingValue = cluster.mapping_type ?? "related";

  return (
    <Card className="border border-slate-200" title={cluster.cluster_id}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-cfh-ink">
            <input
              checked={selected}
              disabled={locked}
              onChange={() => onToggleSelect(cluster.cluster_id)}
              type="checkbox"
            />
            选中用于合并
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {cluster.is_orphan ? <Badge tone="warning">孤儿词条簇</Badge> : <Badge tone="success">常规簇</Badge>}
            <Badge tone="neutral">映射：{mappingValue}</Badge>
            <Badge tone="neutral">置信度：{confidenceLabel}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="text-xs text-cfh-muted">
            推荐中文名
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-cfh-ink"
              disabled={locked}
              onChange={(event) =>
                onUpdateName(cluster.cluster_id, event.target.value, cluster.canonical_name_en)
              }
              value={cluster.canonical_name_cn}
            />
          </label>
          <label className="text-xs text-cfh-muted">
            推荐英文名
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-cfh-ink"
              disabled={locked}
              onChange={(event) =>
                onUpdateName(cluster.cluster_id, cluster.canonical_name_cn, event.target.value)
              }
              value={cluster.canonical_name_en}
            />
          </label>
          <label className="text-xs text-cfh-muted">
            映射类型
            <select
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-cfh-ink disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={locked}
              onChange={(event) =>
                onUpdateMappingType(cluster.cluster_id, event.target.value as MappingType)
              }
              value={mappingValue}
            >
              {MAPPING_TYPES.map((mappingType) => (
                <option key={mappingType} value={mappingType}>
                  {mappingType}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(cluster.aliases?.length || cluster.rationale) ? (
          <div className="space-y-1 rounded-md border border-slate-100 bg-slate-50 p-2 text-xs">
            {cluster.aliases?.length ? (
              <p className="text-cfh-muted">
                变体：<span className="text-cfh-ink">{cluster.aliases.join(" / ")}</span>
              </p>
            ) : null}
            {cluster.rationale ? (
              <p className="text-cfh-muted">
                理由：<span className="text-cfh-ink">{cluster.rationale}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium text-cfh-muted">成员术语（可拆分）</p>
          {cluster.members.map((member) => (
            <div
              key={`${cluster.cluster_id}-${member.author}-${member.term_id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 bg-white px-2 py-1.5 text-xs"
            >
              <span className="text-cfh-ink">
                {member.author} / {member.term_id} / {member.term_name}
              </span>
              {cluster.members.length > 1 ? (
                <Button
                  className="px-2 py-1 text-xs"
                  disabled={locked}
                  onClick={() => onSplitMember(cluster.cluster_id, member.term_id)}
                  type="button"
                  variant="ghost"
                >
                  拆分为新簇
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
