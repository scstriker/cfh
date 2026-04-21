import type { ConceptCluster } from "@/lib/types";
import { Card } from "@/components/ui/Card";

interface AlignmentMatrixProps {
  authors: string[];
  clusters: ConceptCluster[];
}

export function AlignmentMatrix({ authors, clusters }: AlignmentMatrixProps) {
  return (
    <Card title="概念对齐映射表">
      {clusters.length === 0 ? (
        <p className="text-sm text-cfh-muted">尚未生成概念簇。</p>
      ) : (
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
              {clusters.map((cluster) => {
                const authorSet = new Set(cluster.members.map((member) => member.author));
                return (
                  <tr key={cluster.cluster_id} className="border-b border-slate-100 text-cfh-ink">
                    <td className="sticky left-0 bg-white px-2 py-1.5">
                      {cluster.canonical_name_cn || cluster.cluster_id}
                    </td>
                    {authors.map((author) => (
                      <td key={`${cluster.cluster_id}-${author}`} className="px-2 py-1.5">
                        {authorSet.has(author) ? "✔" : "—"}
                      </td>
                    ))}
                    <td className="px-2 py-1.5">{cluster.members.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
