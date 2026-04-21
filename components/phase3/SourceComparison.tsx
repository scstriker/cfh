import type { MergeSourceEntry } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";

interface SourceComparisonProps {
  sourceEntries: MergeSourceEntry[];
  primaryAuthor: string;
}

export function SourceComparison({ sourceEntries, primaryAuthor }: SourceComparisonProps) {
  if (!sourceEntries.length) {
    return <p className="text-xs text-cfh-muted">暂无原文来源。</p>;
  }

  const sorted = [...sourceEntries].sort((a, b) => {
    if (a.author === primaryAuthor) return -1;
    if (b.author === primaryAuthor) return 1;
    return a.author.localeCompare(b.author, "zh-Hans-CN");
  });

  return (
    <div className="space-y-2">
      {sorted.map((entry) => (
        <details key={`${entry.author}-${entry.term_id}`} className="rounded-md border border-slate-200 bg-white p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs">
            <span className="font-medium text-cfh-ink">
              {entry.author} / {entry.term_id} / {entry.term_name_cn}
            </span>
            <span>
              {entry.author === primaryAuthor ? <Badge tone="neutral">主稿</Badge> : null}
              {entry.has_definition ? (
                <Badge tone="success">有定义</Badge>
              ) : (
                <Badge tone="warning">仅标题</Badge>
              )}
            </span>
          </summary>
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-cfh-muted">章节：{entry.chapter}</p>
            <p className="whitespace-pre-wrap leading-6 text-cfh-ink">
              {entry.definition || "（无定义内容）"}
            </p>
          </div>
        </details>
      ))}
    </div>
  );
}
