import type { ParsedDoc } from "@/lib/types";
import { Card } from "@/components/ui/Card";

interface ParsePreviewProps {
  docs: ParsedDoc[];
}

export function ParsePreview({ docs }: ParsePreviewProps) {
  if (docs.length === 0) {
    return (
      <Card title="解析预览">
        <p className="text-sm text-cfh-muted">尚未解析文档。</p>
      </Card>
    );
  }

  return (
    <Card title="解析预览">
      <div className="space-y-4">
        {docs.map((doc) => (
          <div key={doc.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-cfh-ink">{doc.author}</h4>
              <p className="text-xs text-cfh-muted">术语条目：{doc.terms.length}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-cfh-muted">
                    <th className="px-2 py-1">编号</th>
                    <th className="px-2 py-1">中文名</th>
                    <th className="px-2 py-1">英文名</th>
                    <th className="px-2 py-1">是否有定义</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.terms.slice(0, 12).map((term) => (
                    <tr key={`${doc.id}-${term.id}`} className="border-b border-slate-100 text-cfh-ink">
                      <td className="px-2 py-1">{term.id}</td>
                      <td className="px-2 py-1">{term.name_cn}</td>
                      <td className="px-2 py-1">{term.name_en || "-"}</td>
                      <td className="px-2 py-1">{term.has_definition ? "✔" : "○"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
