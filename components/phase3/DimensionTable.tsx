import type { Dimension } from "@/lib/types";

interface DimensionTableProps {
  dimensions: Dimension[];
}

export function DimensionTable({ dimensions }: DimensionTableProps) {
  if (!dimensions.length) {
    return <p className="text-xs text-cfh-muted">暂无维度拆解结果。</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-cfh-muted">
            <th className="px-2 py-1.5">维度</th>
            <th className="px-2 py-1.5">描述与来源</th>
          </tr>
        </thead>
        <tbody>
          {dimensions.map((dimension, index) => (
            <tr key={`${dimension.label}-${index}`} className="border-b border-slate-100">
              <td className="px-2 py-1.5 align-top font-medium text-cfh-ink">{dimension.label}</td>
              <td className="space-y-1 px-2 py-1.5">
                {dimension.descriptions.map((description, subIndex) => (
                  <p key={`${dimension.label}-${subIndex}`} className="text-cfh-ink">
                    {description.text}
                    <span className="ml-1 text-cfh-muted">
                      [{description.sources.join("、") || "未知来源"}]
                    </span>
                  </p>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
