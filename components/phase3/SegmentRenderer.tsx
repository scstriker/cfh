import type { Segment } from "@/lib/types";

const SOURCE_COLORS: Record<string, string> = {
  宋凤麒: "#BDD7EE",
  关奉伟: "#C6EFCE",
  吕鹏: "#FCE4D6",
  王可心: "#D9D2E9",
  张宏刚: "#F4CCCC",
  曹坤: "#D0E0E3",
  柴智敏: "#F4C2C2",
  陈磊: "#FFF2CC"
};

interface SegmentRendererProps {
  segments: Segment[];
  fallbackText?: string;
}

function colorOf(source: string) {
  return SOURCE_COLORS[source] ?? "#E5E7EB";
}

export function SegmentRenderer({ segments, fallbackText = "" }: SegmentRendererProps) {
  if (!segments.length) {
    return <p className="whitespace-pre-wrap text-sm leading-7 text-cfh-ink">{fallbackText || "（暂无合并文本）"}</p>;
  }

  return (
    <p className="whitespace-pre-wrap text-sm leading-7 text-cfh-ink">
      {segments.map((segment, index) => (
        <span
          key={`${segment.source}-${index}-${segment.text.slice(0, 8)}`}
          className="rounded-[2px] px-0.5"
          style={{ backgroundColor: colorOf(segment.source) }}
          title={segment.source}
        >
          {segment.text}
        </span>
      ))}
    </p>
  );
}

export function sourceColorMap() {
  return SOURCE_COLORS;
}
