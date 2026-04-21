"use client";

import type { ConceptCluster } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface OrphanTermPanelProps {
  clusters: ConceptCluster[];
  onToggleInclude: (clusterId: string, include: boolean) => void;
  onUpdateChapter: (clusterId: string, chapter: string) => void;
}

export function OrphanTermPanel({
  clusters,
  onToggleInclude,
  onUpdateChapter
}: OrphanTermPanelProps) {
  const orphans = clusters.filter((cluster) => cluster.is_orphan);

  return (
    <Card title="孤儿词条挂载建议">
      {orphans.length === 0 ? (
        <p className="text-sm text-cfh-muted">暂无孤儿词条。</p>
      ) : (
        <div className="space-y-3">
          {orphans.map((cluster) => {
            const include = cluster.include_in_scope ?? true;
            return (
              <div
                key={cluster.cluster_id}
                className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-cfh-ink">
                    {cluster.cluster_id} / {cluster.canonical_name_cn}
                  </p>
                  <Badge tone="warning">孤儿</Badge>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-cfh-ink">
                  <input
                    checked={include}
                    onChange={(event) => onToggleInclude(cluster.cluster_id, event.target.checked)}
                    type="checkbox"
                  />
                  纳入标准草案
                </label>
                <label className="block text-xs text-cfh-muted">
                  建议挂载章节
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-cfh-ink"
                    onChange={(event) => onUpdateChapter(cluster.cluster_id, event.target.value)}
                    value={cluster.suggested_chapter ?? ""}
                  />
                </label>
                {cluster.mounting_reason ? (
                  <p className="text-xs text-cfh-muted">理由：{cluster.mounting_reason}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
