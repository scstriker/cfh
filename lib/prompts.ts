import type { MappingType, ParsedDoc } from "@/lib/types";
import type { PreclusterCandidate, PreclusterGroup } from "@/lib/precluster";

export interface AlignmentResponse {
  concept_clusters: Array<{
    cluster_id: string;
    canonical_name_cn: string;
    canonical_name_en: string;
    members: Array<{
      author: string;
      term_id: string;
      term_name: string;
    }>;
    is_orphan: boolean;
    confidence?: number;
    rationale?: string;
    mapping_type?: MappingType;
    aliases?: string[];
    suggested_chapter?: string;
    mounting_reason?: string;
  }>;
}

export const ALIGNMENT_SYSTEM_INSTRUCTION = `你是术语体系分类专家。
任务是将多位专家的术语清单按“语义同一概念”进行聚类，并给出推荐标准名称。
要求：
1) 禁止外部搜索，只依据输入材料。
2) 术语变体要归并（同义、近义、不同写法）。
3) 对仅在少数文档出现的孤儿词条，给出挂载章节建议与理由。
4) 输出必须为 JSON，且字段完整。`;

export const ALIGNMENT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    concept_clusters: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          cluster_id: { type: "STRING" },
          canonical_name_cn: { type: "STRING" },
          canonical_name_en: { type: "STRING" },
          members: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                author: { type: "STRING" },
                term_id: { type: "STRING" },
                term_name: { type: "STRING" }
              },
              required: ["author", "term_id", "term_name"]
            }
          },
          is_orphan: { type: "BOOLEAN" },
          confidence: { type: "NUMBER" },
          rationale: { type: "STRING" },
          mapping_type: { type: "STRING" },
          aliases: {
            type: "ARRAY",
            items: { type: "STRING" }
          },
          suggested_chapter: { type: "STRING" },
          mounting_reason: { type: "STRING" }
        },
        required: [
          "cluster_id",
          "canonical_name_cn",
          "canonical_name_en",
          "members",
          "is_orphan"
        ]
      }
    }
  },
  required: ["concept_clusters"]
};

interface BuildAlignmentPromptParams {
  parsedDocs: ParsedDoc[];
  preclusterCandidates?: PreclusterCandidate[];
  preclusterGroups?: PreclusterGroup[];
}

function formatPreclusterSection(
  preclusterCandidates: PreclusterCandidate[],
  preclusterGroups: PreclusterGroup[]
) {
  const candidateLines = preclusterCandidates
    .slice(0, 120)
    .map(
      (candidate) =>
        `- ${candidate.left_term_name} <> ${candidate.right_term_name} | score=${candidate.score.toFixed(
          2
        )} | methods=${candidate.methods.join("+")}`
    );

  const groupLines = preclusterGroups.slice(0, 80).map((group) => {
    const aliases = group.aliases.slice(0, 10).join(" / ");
    return `- ${group.group_id} | aliases=${aliases}`;
  });

  return [
    "预聚类候选（仅供参考，可推翻）：",
    candidateLines.length ? candidateLines.join("\n") : "- 无",
    "",
    "预聚类候选簇（仅供参考，可拆分/合并）：",
    groupLines.length ? groupLines.join("\n") : "- 无"
  ].join("\n");
}

export function buildAlignmentPrompt({
  parsedDocs,
  preclusterCandidates = [],
  preclusterGroups = []
}: BuildAlignmentPromptParams) {
  const lines: string[] = [];
  parsedDocs.forEach((doc) => {
    lines.push(`【专家】${doc.author}（文件：${doc.file_name}）`);
    doc.terms.forEach((term) => {
      const nameEn = term.name_en ? ` | EN:${term.name_en}` : "";
      lines.push(
        `- ${term.id} | 章节:${term.chapter} | CN:${term.name_cn}${nameEn} | 定义:${term.has_definition ? "有" : "无"}`
      );
    });
  });

  return `请对以下术语清单做概念聚类并输出 JSON。

输出规则：
1) 每个 concept_cluster 代表一个语义概念。
2) canonical_name_cn / canonical_name_en 使用你建议的标准名称。
3) members 填写来源专家、术语编号、术语名。
4) 若为孤儿词条（主框架外或仅少数文档出现且难以归并），is_orphan=true，并补充 suggested_chapter 与 mounting_reason。
5) cluster_id 使用稳定字符串，例如 C001、C002。
6) 对每个 concept_cluster 额外给出：
   - mapping_type（exact/close/broad/narrow/related）
   - confidence（0-1）
   - rationale（简短理由）
   - aliases（该簇术语变体名列表）
7) “预聚类候选”只作为参考，你可以推翻候选并给出更合理聚类。

术语清单：
${lines.join("\n")}

${formatPreclusterSection(preclusterCandidates, preclusterGroups)}`;
}

export const MERGE_SYSTEM_INSTRUCTION = `你是术语合并专家。
规则：
1) 严禁外部搜索；
2) 以主稿为骨架；
3) 先做“属+种差”维度拆解，再进行增量嫁接；
4) 输出中文；
5) 输出 JSON，包含 dimensions、segments、notes。`;

export const MERGE_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    dimensions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          descriptions: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                text: { type: "STRING" },
                sources: {
                  type: "ARRAY",
                  items: { type: "STRING" }
                }
              },
              required: ["text", "sources"]
            }
          }
        },
        required: ["label", "descriptions"]
      }
    },
    segments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          source: { type: "STRING" }
        },
        required: ["text", "source"]
      }
    },
    notes: { type: "STRING" }
  },
  required: ["dimensions", "segments", "notes"]
};

export interface MergePromptTermInput {
  author: string;
  term_id: string;
  term_name_cn: string;
  term_name_en: string;
  chapter: string;
  definition: string;
  has_definition: boolean;
}

export function buildMergePrompt(params: {
  clusterId: string;
  canonicalNameCn: string;
  canonicalNameEn: string;
  primaryAuthor: string;
  terms: MergePromptTermInput[];
}) {
  const { clusterId, canonicalNameCn, canonicalNameEn, primaryAuthor, terms } = params;

  const lines = terms.map((term) => {
    const nameEn = term.term_name_en ? ` / ${term.term_name_en}` : "";
    const definition = term.definition ? term.definition : "（无定义）";
    return [
      `- 专家: ${term.author}`,
      `编号: ${term.term_id}`,
      `术语: ${term.term_name_cn}${nameEn}`,
      `章节: ${term.chapter}`,
      `定义: ${definition}`
    ].join(" | ");
  });

  return `请对以下术语进行合并，输出 JSON（dimensions + segments + notes）。

概念簇：${clusterId}
推荐术语：${canonicalNameCn}${canonicalNameEn ? ` / ${canonicalNameEn}` : ""}
主稿作者：${primaryAuthor || "未指定"}

要求：
1) 先输出 dimensions（属+种差拆解，每条描述带 sources）；
2) 再输出 segments（短语级文本片段，source 为专家名）；
3) notes 说明合并策略与争议点；
4) 全程中文，不使用外部信息。

输入术语：
${lines.join("\n")}`;
}
