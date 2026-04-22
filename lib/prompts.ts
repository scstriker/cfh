import { buildDefinitionStyleGuideText } from "@/lib/definitionStyle";
import type {
  GoldStandardEntry,
  MappingType,
  ParsedDoc,
  TemplateOutline,
  TemplateTerm
} from "@/lib/types";
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
    template_term_id?: string;
    in_template_scope?: boolean;
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
          template_term_id: { type: "STRING" },
          in_template_scope: { type: "BOOLEAN" },
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
  templateOutline: TemplateOutline;
  goldStandardEntries?: GoldStandardEntry[];
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
  templateOutline,
  goldStandardEntries = [],
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

  const goldTemplateIds = new Set(goldStandardEntries.map((entry) => entry.template_term_id));
  const templateLines = templateOutline.terms.map((term) => {
    const nameEn = term.name_en ? ` | EN:${term.name_en}` : "";
    const goldTag = goldTemplateIds.has(term.template_term_id) ? " | 金标准:是" : "";
    return `- ${term.template_term_id} | 章节:${term.chapter} | CN:${term.name_cn}${nameEn}${goldTag}`;
  });

  return `请对以下术语清单做概念聚类并输出 JSON。

输出规则：
1) 模板术语是首选锚点。优先围绕模板中的术语建立概念簇。
2) 每个 concept_cluster 代表一个语义概念。
3) canonical_name_cn / canonical_name_en 使用你建议的标准名称。
4) members 填写来源专家、术语编号、术语名。
5) 若概念可映射到模板术语，填写 template_term_id，并设置 in_template_scope=true。
6) 若为模板外孤儿词条或仅少数文档出现且难以归并，is_orphan=true，并补充 suggested_chapter 与 mounting_reason。
7) cluster_id 使用稳定字符串，例如 C001、C002。
8) 对每个 concept_cluster 额外给出：
   - mapping_type（exact/close/broad/narrow/related）
   - confidence（0-1）
   - rationale（简短理由）
   - aliases（该簇术语变体名列表）
9) “预聚类候选”只作为参考，你可以推翻候选并给出更合理聚类。
10) 若模板术语已标记“金标准:是”，仍可挂接专家同名/近名词条，但保留该模板锚点，不要改写为模板外词条。

模板骨架：
${templateLines.join("\n")}

术语清单：
${lines.join("\n")}

${formatPreclusterSection(preclusterCandidates, preclusterGroups)}`;
}

export const MERGE_SYSTEM_INSTRUCTION = `你是术语标准合并专家。你的任务是将多位专家对同一术语的定义合并为一条符合国家标准格式的定义。

核心规则：
1) 严禁外部搜索，只使用输入材料；
2) 模板只约束术语锚点和章节，不作为定义来源；
3) 所有专家定义平等输入，先做“属+种差”维度拆解，再提炼共识与差异；
4) 遵循“共识优先”原则：提取多数专家的共识表述作为定义核心，仅在不违背共识时补充个别专家的独特贡献；
5) 与共识明显矛盾、重复价值低或表述质量不足的内容，不纳入最终定义，在 excluded_sources 中记录原因；
6) 输出中文；
7) 输出 JSON，包含 dimensions、segments、notes、excluded_sources、reference_items。

定义质量规则：
8) 定义必须是一个完整的中文句子，只有一个句号在末尾，句内用逗号分隔从句；
9) 行文逻辑顺序：属概念 → 前提条件 → 核心操作 → 作用对象 → 效果目标；
10) 总字数默认不超过 150 字，单个从句默认不超过 30 字；
11) 严禁循环定义：定义中不得出现被定义术语的中文名或英文名；
12) 不使用未展开的英文缩写，不做英文别名堆叠；
13) 定义读起来应像一条自然的标准术语定义，而不是来源摘录拼接。

${buildDefinitionStyleGuideText()}`;

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
    ,
    excluded_sources: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          author: { type: "STRING" },
          reason: { type: "STRING" }
        },
        required: ["author", "reason"]
      }
    },
    reference_items: {
      type: "ARRAY",
      items: { type: "STRING" }
    }
  },
  required: ["dimensions", "segments", "notes", "excluded_sources"]
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
  templateTerm?: TemplateTerm;
  terms: MergePromptTermInput[];
}) {
  const { clusterId, canonicalNameCn, canonicalNameEn, templateTerm, terms } = params;

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

  return `请对以下术语进行合并，输出 JSON（dimensions + segments + notes + excluded_sources + reference_items）。

概念簇：${clusterId}
推荐术语：${canonicalNameCn}${canonicalNameEn ? ` / ${canonicalNameEn}` : ""}
模板锚点：${
   templateTerm
     ? `${templateTerm.template_term_id} / ${templateTerm.chapter} / ${templateTerm.name_cn}${
         templateTerm.name_en ? ` / ${templateTerm.name_en}` : ""
       }`
     : "无模板锚点（模板外词条）"
 }

要求：
1) 先输出 dimensions（属+种差拆解，每条描述带 sources）；
2) 再输出 segments（短语级文本片段，source 为专家名）；
3) notes 说明合并策略、争议点和过滤理由；
4) excluded_sources 记录未纳入结果的专家与原因；
5) reference_items 若无法稳定给出可返回空数组；
6) 全程中文，不使用外部信息。
7) 最终定义必须符合下列标准写法契约：
${buildDefinitionStyleGuideText()}

输入术语：
${lines.join("\n")}`;
}

export interface GoldStandardConversionResponse {
  entries: Array<{
    template_term_id: string;
    source_excerpt: string;
    standard_definition: string;
    notes?: string;
  }>;
  unmatched_excerpts: string[];
}

export const GOLD_STANDARD_CONVERSION_SYSTEM_INSTRUCTION = `你是术语标准化专家。你的任务是把问答式、说明式材料中的术语解释，转换为符合国家标准风格的术语定义候选。

核心要求：
1) 仅依据输入的模板术语与源材料，不得外推；
2) 只输出能明确映射到模板术语的条目；
3) 对每个条目，将原始说明改写成标准术语定义句；
4) 不保留问答口吻、背景铺垫、宣传性措辞或与定义无关的解释；
5) 无法明确映射的段落放入 unmatched_excerpts。

${buildDefinitionStyleGuideText()}`;

export const GOLD_STANDARD_CONVERSION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    entries: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          template_term_id: { type: "STRING" },
          source_excerpt: { type: "STRING" },
          standard_definition: { type: "STRING" },
          notes: { type: "STRING" }
        },
        required: ["template_term_id", "source_excerpt", "standard_definition"]
      }
    },
    unmatched_excerpts: {
      type: "ARRAY",
      items: { type: "STRING" }
    }
  },
  required: ["entries", "unmatched_excerpts"]
};

export function buildGoldStandardConversionPrompt(params: {
  sourceDocName: string;
  sourceText: string;
  templateOutline: TemplateOutline;
}) {
  const templateLines = params.templateOutline.terms.map((term) => {
    const nameEn = term.name_en ? ` / ${term.name_en}` : "";
    const existingDefinition = term.existing_definition
      ? ` | 模板现有说明:${term.existing_definition}`
      : "";
    return `- ${term.template_term_id} | ${term.chapter} | ${term.name_cn}${nameEn}${existingDefinition}`;
  });

  return `请将以下材料转换为可导入金标准 CSV 的术语定义候选。

输出规则：
1) entries 中每项必须绑定到一个 template_term_id；
2) source_excerpt 保留支撑该定义的原始摘录，长度尽量控制在 120 字以内；
3) standard_definition 必须是标准术语定义句，不得出现问答口吻；
4) 若多个段落都在解释同一术语，请提炼一条最佳定义；
5) 不确定归属的内容放到 unmatched_excerpts，不要猜测映射。

模板术语：
${templateLines.join("\n")}

源材料文件：${params.sourceDocName}
源材料文本：
${params.sourceText}`;
}
