import { extractDocxLines } from "@/lib/parser";
import type {
  ConceptCluster,
  TemplateDoc,
  TemplateOutline,
  TemplateTerm
} from "@/lib/types";

function cleanText(input: string) {
  return input.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

export function normalizeTemplateLookup(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）[\]【】\-–—_/;；,，.。:：]/g, "");
}

function createTemplateTerms(
  terms: Array<{
    chapter: string;
    name_cn: string;
    name_en: string;
    definition?: string;
  }>
): TemplateTerm[] {
  return terms.map((term, index) => ({
    template_term_id: `T${String(index + 1).padStart(3, "0")}`,
    chapter: term.chapter || "术语和定义",
    name_cn: term.name_cn,
    name_en: term.name_en,
    existing_definition: term.definition?.trim() || undefined
  }));
}

function parseTemplateBilingualLine(line: string) {
  const text = cleanText(line);
  const match = text.match(/^(.+?)\s+([A-Za-z][A-Za-z0-9\s\-(),./]+)$/);
  if (!match) {
    return null;
  }
  return {
    name_cn: cleanText(match[1]),
    name_en: cleanText(match[2])
  };
}

function isTemplateDefinitionLine(line: string) {
  const text = cleanText(line);
  if (!text) return false;
  if (text.length >= 18) return true;
  return /[，。,；;：:]/.test(text);
}

function isTemplateMetaLine(line: string) {
  const text = cleanText(line);
  if (!text) return true;
  return /(前言|范围|规范性引用文件|参考文献|发布|实施|起草单位|主要起草人|中华人民共和国国家标准|ICS|CCS|GB\/T)/.test(
    text
  );
}

function isTemplateChapterLine(line: string, nextLine: string, seenTerms: Set<string>) {
  const text = cleanText(line);
  if (!text) return false;
  if (/[A-Za-z]/.test(text)) return false;
  if (/[，。,；;：:]/.test(text)) return false;
  if (text === "基础术语" || text === "原子级制造应用服务") {
    return true;
  }
  if (
    text === "原子级制造产品" &&
    seenTerms.has(text) &&
    cleanText(nextLine).startsWith("原子级制造")
  ) {
    return true;
  }
  return false;
}

function splitConcatenatedTemplateTerms(line: string) {
  const text = cleanText(line);
  if (
    !text ||
    /[A-Za-z]/.test(text) ||
    /[，。,；;：:]/.test(text) ||
    !/^(?:单原子|原子)/.test(text)
  ) {
    return [text].filter(Boolean);
  }

  const indices = Array.from(text.matchAll(/(?:单原子|原子)/g))
    .map((match) => match.index ?? 0)
    .filter((index, idx) => idx === 0 || index > 0);

  if (indices.length <= 1) {
    return [text];
  }

  const pieces: string[] = [];
  indices.forEach((start, index) => {
    const end = indices[index + 1] ?? text.length;
    const piece = cleanText(text.slice(start, end));
    if (piece) {
      pieces.push(piece);
    }
  });

  return pieces;
}

function preprocessTemplateLines(lines: string[]) {
  const result: string[] = [];

  lines.forEach((rawLine) => {
    let line = cleanText(rawLine);
    if (!line) {
      return;
    }

    if (line.includes("术语和定义")) {
      result.push("术语和定义");
      line = cleanText(line.replace(/^.*术语和定义/, ""));
    }

    if (line.startsWith("基础术语") && line !== "基础术语") {
      result.push("基础术语");
      line = cleanText(line.slice("基础术语".length));
    }

    if (
      line.startsWith("原子级制造产品") &&
      line !== "原子级制造产品" &&
      line.includes("原子级制造材料")
    ) {
      result.push("原子级制造产品");
      line = cleanText(line.slice("原子级制造产品".length));
    }

    if (
      line.startsWith("原子级制造应用服务") &&
      line !== "原子级制造应用服务" &&
      line.includes("原子级制造评价指标")
    ) {
      result.push("原子级制造应用服务");
      line = cleanText(line.slice("原子级制造应用服务".length));
    }

    if (!line) {
      return;
    }

    splitConcatenatedTemplateTerms(line).forEach((item) => {
      if (item) {
        result.push(item);
      }
    });
  });

  return result;
}

function parseTemplateTerms(lines: string[]) {
  const normalizedLines = preprocessTemplateLines(lines);
  const terms: Array<{
    chapter: string;
    name_cn: string;
    name_en: string;
    definition?: string;
  }> = [];
  const seenTerms = new Set<string>();
  let inTermSection = false;
  let currentChapter = "基础术语";

  for (let i = 0; i < normalizedLines.length; i += 1) {
    const line = cleanText(normalizedLines[i]);
    const nextLine = cleanText(normalizedLines[i + 1] ?? "");
    if (!line) continue;

    if (line.includes("术语和定义")) {
      inTermSection = true;
      continue;
    }
    if (!inTermSection) {
      continue;
    }
    if (line === "参考文献") {
      break;
    }
    if (isTemplateMetaLine(line)) {
      continue;
    }
    if (isTemplateChapterLine(line, nextLine, seenTerms)) {
      currentChapter = line;
      continue;
    }

    const bilingual = parseTemplateBilingualLine(line);
    const nameCn = bilingual?.name_cn ?? line;
    const nameEn = bilingual?.name_en ?? "";

    if (!/^[\u4e00-\u9fff]/.test(nameCn)) {
      continue;
    }
    if (nameCn.length > 36) {
      continue;
    }
    if (/[，。,；;：:]/.test(nameCn)) {
      continue;
    }
    if (seenTerms.has(nameCn)) {
      continue;
    }
    if (isTemplateDefinitionLine(line) && !bilingual) {
      continue;
    }

    let definition = "";
    if (
      nextLine &&
      !isTemplateMetaLine(nextLine) &&
      !isTemplateChapterLine(nextLine, cleanText(normalizedLines[i + 2] ?? ""), seenTerms)
    ) {
      const nextIsBilingual = Boolean(parseTemplateBilingualLine(nextLine));
      const nextLooksTerm =
        /^[\u4e00-\u9fff]/.test(nextLine) &&
        nextLine.length <= 36 &&
        !/[，。,；;：:]/.test(nextLine) &&
        !nextIsBilingual;
      if (!nextLooksTerm && isTemplateDefinitionLine(nextLine)) {
        definition = nextLine;
      }
    }

    terms.push({
      chapter: currentChapter,
      name_cn: nameCn,
      name_en: nameEn,
      definition: definition || undefined
    });
    seenTerms.add(nameCn);
  }

  return terms;
}

export function findTemplateTermById(
  templateOutline: TemplateOutline | null,
  templateTermId?: string
) {
  if (!templateOutline || !templateTermId) {
    return undefined;
  }
  return templateOutline.terms.find((term) => term.template_term_id === templateTermId);
}

export function findTemplateTermForNames(
  templateOutline: TemplateOutline | null,
  names: string[]
) {
  if (!templateOutline) {
    return undefined;
  }

  const normalizedNames = names
    .map((name) => normalizeTemplateLookup(name))
    .filter((name) => name.length > 0);

  if (normalizedNames.length === 0) {
    return undefined;
  }

  return templateOutline.terms.find((term) => {
    const cn = normalizeTemplateLookup(term.name_cn);
    const en = normalizeTemplateLookup(term.name_en);
    return normalizedNames.some((name) => name === cn || (en && name === en));
  });
}

export function findTemplateTermForCluster(
  templateOutline: TemplateOutline | null,
  cluster: Pick<
    ConceptCluster,
    "template_term_id" | "canonical_name_cn" | "canonical_name_en" | "aliases" | "members"
  >
) {
  const byId = findTemplateTermById(templateOutline, cluster.template_term_id);
  if (byId) {
    return byId;
  }

  const candidateNames = [
    cluster.canonical_name_cn,
    cluster.canonical_name_en,
    ...(cluster.aliases ?? []),
    ...cluster.members.map((member) => member.term_name)
  ].filter((name): name is string => Boolean(name && name.trim()));

  return findTemplateTermForNames(templateOutline, candidateNames);
}

export async function parseTemplateDocx(file: File): Promise<{
  templateDoc: TemplateDoc;
  templateOutline: TemplateOutline;
}> {
  const lines = await extractDocxLines(file);
  const parsedTerms = parseTemplateTerms(lines);
  const templateTerms = createTemplateTerms(parsedTerms);
  const chapterOrder = Array.from(
    new Set(templateTerms.map((term) => term.chapter || "术语和定义").filter(Boolean))
  );
  const uploadedAt = new Date().toISOString();

  return {
    templateDoc: {
      id: crypto.randomUUID(),
      file_name: file.name,
      uploaded_at: uploadedAt
    },
    templateOutline: {
      file_name: file.name,
      uploaded_at: uploadedAt,
      chapter_order: chapterOrder,
      terms: templateTerms
    }
  };
}
