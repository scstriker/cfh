import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { buildConceptCoverageRows, buildTermPreviewRows } from "@/lib/coverage";
import type { ConceptCluster, ParsedDoc } from "@/lib/types";

interface CoverageMatrixProps {
  docs: ParsedDoc[];
  conceptClusters?: ConceptCluster[];
}

export function CoverageMatrix({ docs, conceptClusters = [] }: CoverageMatrixProps) {
  if (docs.length === 0) {
    return (
      <Card title="覆盖矩阵">
        <p className="text-sm text-cfh-muted">上传并解析文档后显示覆盖矩阵。</p>
      </Card>
    );
  }

  if (conceptClusters.length > 0) {
    const { authors, rows } = buildConceptCoverageRows({ docs, conceptClusters });
    return (
      <Card title="覆盖矩阵（行=概念簇，列=专家）">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-cfh-muted">
                <th className="sticky left-0 bg-white px-2 py-2">概念簇</th>
                {authors.map((author) => (
                  <th key={author} className="px-2 py-2">
                    {author}
                  </th>
                ))}
                <th className="px-2 py-2">成员数</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.cluster_id} className="border-b border-slate-100 text-cfh-ink">
                  <td className="sticky left-0 space-y-1 bg-white px-2 py-1.5">
                    <p className="font-medium text-cfh-ink">
                      {row.canonical_name_cn || row.cluster_id}
                      {row.canonical_name_en ? ` / ${row.canonical_name_en}` : ""}
                    </p>
                    {row.aliases.length ? (
                      <p className="text-[11px] text-cfh-muted">变体：{row.aliases.join(" / ")}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-1">
                      {row.is_orphan ? <Badge tone="warning">孤儿</Badge> : null}
                      {row.mapping_type ? <Badge tone="neutral">映射：{row.mapping_type}</Badge> : null}
                      {typeof row.confidence === "number" ? (
                        <Badge tone="neutral">置信度：{Math.round(row.confidence * 100)}%</Badge>
                      ) : null}
                    </div>
                  </td>
                  {authors.map((author) => (
                    <td key={`${row.cluster_id}-${author}`} className="px-2 py-1.5">
                      {row.marks[author] ?? "—"}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">{row.member_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  const { authors, rows } = buildTermPreviewRows(docs);

  return (
    <Card title="术语预览矩阵（行=术语，列=专家）">
      <p className="mb-2 text-xs text-cfh-muted">完成阶段零对齐后将切换为概念簇覆盖矩阵。</p>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-cfh-muted">
              <th className="sticky left-0 bg-white px-2 py-2">术语</th>
              {authors.map((author) => (
                <th key={author} className="px-2 py-2">
                  {author}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-slate-100 text-cfh-ink">
                <td className="sticky left-0 bg-white px-2 py-1.5">{row.name}</td>
                {authors.map((author) => (
                  <td key={`${row.name}-${author}`} className="px-2 py-1.5">
                    {row.marks[author] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
