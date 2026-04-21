import { saveAs } from "file-saver";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";
import type { MergeResult, ReviewDecision, Segment } from "@/lib/types";

const SOURCE_COLORS: Record<string, string> = {
  宋凤麒: "BDD7EE",
  关奉伟: "C6EFCE",
  吕鹏: "FCE4D6",
  王可心: "D9D2E9",
  张宏刚: "F4CCCC",
  曹坤: "D0E0E3",
  柴智敏: "F4C2C2",
  陈磊: "FFF2CC"
};

function bodyRun(text: string) {
  return new TextRun({
    text,
    font: {
      eastAsia: "宋体",
      ascii: "Times New Roman",
      hAnsi: "Times New Roman"
    },
    size: 24
  });
}

function headingRun(text: string) {
  return new TextRun({
    text,
    bold: true,
    font: {
      eastAsia: "黑体",
      ascii: "Times New Roman",
      hAnsi: "Times New Roman"
    },
    size: 28
  });
}

function fallbackSegments(result: MergeResult, decision?: ReviewDecision): Segment[] {
  if (decision?.final_segments?.length) {
    return decision.final_segments;
  }
  if (result.segments.length) {
    return result.segments;
  }
  if (decision?.final_text) {
    return [{ text: decision.final_text, source: "手动编辑" }];
  }
  if (result.merged_definition) {
    return [{ text: result.merged_definition, source: "未知来源" }];
  }
  return [];
}

function segmentRun(segment: Segment) {
  return new TextRun({
    text: segment.text,
    font: {
      eastAsia: "宋体",
      ascii: "Times New Roman",
      hAnsi: "Times New Roman"
    },
    size: 24,
    shading: {
      type: ShadingType.CLEAR,
      fill: SOURCE_COLORS[segment.source] ?? "E5E7EB",
      color: "auto"
    }
  });
}

function buildSourceSummary(results: MergeResult[], decisions: Record<string, ReviewDecision>) {
  const counter = new Map<string, number>();
  results.forEach((result) => {
    const decision = decisions[result.cluster_id];
    const segments = fallbackSegments(result, decision);
    segments.forEach((segment) => {
      const count = counter.get(segment.source) ?? 0;
      counter.set(segment.source, count + 1);
    });
  });
  return Array.from(counter.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

function sourceSummaryTable(rows: Array<{ source: string; count: number }>) {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [bodyRun("来源专家")] })]
          }),
          new TableCell({
            children: [new Paragraph({ children: [bodyRun("引用片段数")] })]
          })
        ]
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [bodyRun(row.source)] })]
              }),
              new TableCell({
                children: [new Paragraph({ children: [bodyRun(String(row.count))] })]
              })
            ]
          })
      )
    ]
  });
}

export interface ExportDocxParams {
  results: MergeResult[];
  decisions: Record<string, ReviewDecision>;
  fileName?: string;
}

function buildGbDocxDocument({ results, decisions }: ExportDocxParams) {
  const ordered = [...results].sort((a, b) => a.chapter.localeCompare(b.chapter, "zh-Hans-CN"));
  const summaryRows = buildSourceSummary(ordered, decisions);

  const content: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 400 },
      children: [headingRun("原子级制造 术语（合并稿）")]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [bodyRun(`生成日期：${new Date().toLocaleDateString("zh-CN")}`)]
    }),
    new Paragraph({
      pageBreakBefore: true,
      heading: HeadingLevel.HEADING_1,
      children: [headingRun("前言")]
    }),
    new Paragraph({
      children: [
        bodyRun(
          "本文件由术语草案智能合并系统生成，采用人机协同审阅机制形成，供标准编制工作组讨论。"
        )
      ]
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [headingRun("正文")]
    })
  ];

  let currentChapter = "";
  ordered.forEach((result, index) => {
    const decision = decisions[result.cluster_id];
    const segments = fallbackSegments(result, decision);
    if (result.chapter !== currentChapter) {
      currentChapter = result.chapter;
      content.push(
        new Paragraph({
          spacing: { before: 360, after: 160 },
          heading: HeadingLevel.HEADING_2,
          children: [headingRun(currentChapter)]
        })
      );
    }

    content.push(
      new Paragraph({
        spacing: { before: 200, after: 60 },
        children: [
          bodyRun(`${index + 1}. ${result.term_name_cn}`),
          ...(result.term_name_en ? [bodyRun(` (${result.term_name_en})`)] : [])
        ]
      }),
      new Paragraph({
        children: segments.length ? segments.map((segment) => segmentRun(segment)) : [bodyRun("（暂无内容）")]
      })
    );
  });

  content.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 120 },
      children: [headingRun("参考文献")]
    }),
    new Paragraph({
      children: [bodyRun("本稿依据 8 位专家术语草案及审阅决策自动生成。")]
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [headingRun("来源对照表")]
    }),
    sourceSummaryTable(summaryRows)
  );

  return new Document({
    sections: [
      {
        children: content
      }
    ]
  });
}

export async function buildGbDocxBlob(params: ExportDocxParams) {
  const doc = buildGbDocxDocument(params);
  return Packer.toBlob(doc);
}

export async function buildGbDocxBuffer(params: ExportDocxParams) {
  const doc = buildGbDocxDocument(params);
  return Packer.toBuffer(doc);
}

export async function exportGbDocx(params: ExportDocxParams) {
  const blob = await buildGbDocxBlob(params);
  saveAs(blob, params.fileName ?? "原子级制造术语合并稿.docx");
}

export function getSourceSummaryForPreview(
  results: MergeResult[],
  decisions: Record<string, ReviewDecision>
) {
  return buildSourceSummary(results, decisions);
}
