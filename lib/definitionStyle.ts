export const STANDARD_DEFINITION_RULES = [
  "定义必须是一个完整的中文单句，句末唯一句号，句内优先使用逗号组织分句。",
  "行文顺序优先遵循：属概念 -> 前提/条件 -> 核心动作 -> 作用对象 -> 目的/效果。",
  "定义应是标准术语释义，不保留问答口吻、宣传语、口语化衔接或解释性铺垫。",
  "禁止循环定义：定义中不得直接出现被定义术语的中文名或英文名。",
  "避免英文缩写、英文别名堆叠和多余括注；如必须出现英文，应为术语英文名。",
  "总字数默认不超过 150 字，单个从句默认不超过 30 字。"
] as const;

export const STANDARD_DEFINITION_FEWSHOT = [
  {
    term_name_cn: "增材制造",
    source_excerpt:
      "一种通过逐层堆积材料制造实体零件的方法，通常依据三维模型数据完成成形。",
    standard_definition:
      "基于三维模型数据，通过材料逐层堆积实现实体零件成形的制造方法。"
  },
  {
    term_name_cn: "绿色制造",
    source_excerpt:
      "一种综合考虑资源利用效率和环境影响，使产品全生命周期对环境负面影响尽可能小的制造方式。",
    standard_definition:
      "在产品全生命周期内统筹资源利用效率与环境影响，使环境负荷尽可能小的制造方式。"
  }
] as const;

export function buildDefinitionStyleGuideText() {
  const rules = STANDARD_DEFINITION_RULES.map((rule, index) => `${index + 1}. ${rule}`).join("\n");
  const samples = STANDARD_DEFINITION_FEWSHOT.map(
    (sample, index) =>
      `示例 ${index + 1}\n术语：${sample.term_name_cn}\n原始说明：${sample.source_excerpt}\n标准写法：${sample.standard_definition}`
  ).join("\n\n");

  return `标准术语定义写法契约：
${rules}

参考示例：
${samples}`;
}
