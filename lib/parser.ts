import mammoth from "mammoth";
import type { ParsedDoc, Term } from "@/lib/types";

const KNOWN_AUTHORS = [
  "宋凤麒",
  "关奉伟",
  "吕鹏",
  "王可心",
  "张宏刚",
  "曹坤",
  "柴智敏",
  "陈磊"
];

interface TermDraft {
  id: string;
  chapter: string;
  name_cn: string;
  name_en: string;
  definitionParts: string[];
}

interface BilingualHeader {
  name_cn: string;
  name_en: string;
}

function cleanText(input: string) {
  return input.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function isTermLine(line: string) {
  return /^\d+\.\d+(?:\.\d+)?\s+/.test(line);
}

function isChapterLine(line: string) {
  return /^\d+(?:\.\d+)?\s+\S+/.test(line) && !isTermLine(line);
}

function splitTermHeader(line: string) {
  const match = line.match(/^(\d+\.\d+(?:\.\d+)?)\s+(.+)$/);
  if (!match) {
    return null;
  }

  const id = match[1].trim();
  const tail = cleanText(match[2]);
  const bilingual = tail.match(/^(.+?)\s+([A-Za-z][A-Za-z0-9\s\-(),./]+)$/);

  if (bilingual) {
    return {
      id,
      name_cn: cleanText(bilingual[1]),
      name_en: cleanText(bilingual[2])
    };
  }

  return {
    id,
    name_cn: tail,
    name_en: ""
  };
}

function normalizeKey(input: string) {
  return cleanText(input).toLowerCase().replace(/\s+/g, "");
}

function normalizeCnCandidate(input: string) {
  let value = cleanText(input).replace(/^(术语和定义|基础术语)+/g, "").trim();

  // Some Word exports duplicate EN tail in the CN capture; strip trailing EN tokens.
  while (/\s+[A-Za-z][A-Za-z0-9\-–—/()；;,.]*$/.test(value)) {
    value = value.replace(/\s+[A-Za-z][A-Za-z0-9\-–—/()；;,.]*$/g, "").trim();
  }

  return value;
}

function isValidHeaderPair(nameCn: string, nameEn: string) {
  if (nameCn.length < 2 || nameCn.length > 36) return false;
  if (!/[A-Za-z]/.test(nameEn)) return false;
  if (/[，。,；;：:]/.test(nameCn)) return false;
  if (/。/.test(nameEn)) return false;
  if (/^(ICS|CCS)$/i.test(nameCn) || /^GB\/?T/i.test(nameCn)) return false;
  return true;
}

function parseBilingualBySplit(line: string): BilingualHeader | null {
  const text = cleanText(line);
  if (!/^[\u4e00-\u9fff]/.test(text)) {
    return null;
  }

  const asciiIndexes = Array.from(text.matchAll(/[A-Za-z]/g))
    .map((match) => match.index)
    .filter((index): index is number => typeof index === "number");

  for (const splitIndex of asciiIndexes) {
    if (splitIndex <= 0) {
      continue;
    }

    const nameCn = normalizeCnCandidate(text.slice(0, splitIndex));
    const nameEn = cleanText(text.slice(splitIndex));
    if (!isValidHeaderPair(nameCn, nameEn)) {
      continue;
    }
    // Avoid splitting inside CN tokens like "3D打印", and reject mixed sentence tails.
    if (/[\u4e00-\u9fff]/.test(nameEn.slice(0, 24))) {
      continue;
    }
    // CN side should not keep long EN tails.
    if (/[A-Za-z]{2,}/.test(nameCn)) {
      continue;
    }

    return {
      name_cn: nameCn,
      name_en: nameEn
    };
  }

  return null;
}

function parseBilingualHeader(line: string): BilingualHeader | null {
  return parseBilingualBySplit(line);
}

function buildHeaderKey(header: BilingualHeader) {
  return `${normalizeKey(header.name_cn)}::${normalizeKey(header.name_en)}`;
}

function isSameHeader(left: BilingualHeader, right: BilingualHeader) {
  return (
    normalizeKey(left.name_cn) === normalizeKey(right.name_cn) &&
    normalizeKey(left.name_en) === normalizeKey(right.name_en)
  );
}

function isHeadingLike(line: string) {
  const text = cleanText(line);
  if (!text) return false;
  if (text.length > 24) return false;
  if (/[A-Za-z]/.test(text)) return false;
  return /(前言|范围|规范性引用文件|术语和定义|基础术语|参考文献|总则|发布|实施)/.test(text);
}

function isNonTermChapter(chapter: string) {
  const text = cleanText(chapter);
  if (!text) return false;
  return /(前言|参考文献|范围|规范性引用文件|起草|发布|实施)/.test(text);
}

function isDefinitionCandidate(line: string) {
  const text = cleanText(line);
  if (!text) return false;
  if (text.length < 8) return false;
  if (parseBilingualHeader(text)) return false;
  if (isChapterLine(text) || isHeadingLike(text)) return false;
  const hasCn = /[\u4e00-\u9fff]/.test(text);
  const hasEn = /[A-Za-z]/.test(text);
  if (!hasCn && hasEn) return false;
  return true;
}

function parseFallbackTerms(lines: string[]) {
  const terms: Term[] = [];
  const seen = new Set<string>();
  let currentChapter = "术语和定义";

  for (let i = 0; i < lines.length; i += 1) {
    const line = cleanText(lines[i]);
    if (!line) continue;

    if (/(术语和定义|基础术语)/.test(line)) {
      currentChapter = "术语和定义";
    }

    if (isChapterLine(line) || isHeadingLike(line)) {
      currentChapter = line;
      continue;
    }

    if (isNonTermChapter(currentChapter)) {
      continue;
    }

    const header = parseBilingualHeader(line);
    if (!header) continue;

    const key = buildHeaderKey(header);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    let definition = "";
    for (let j = i + 1; j < Math.min(lines.length, i + 8); j += 1) {
      const candidate = cleanText(lines[j]);
      if (!candidate) continue;
      const candidateHeader = parseBilingualHeader(candidate);
      if (candidateHeader) {
        if (isSameHeader(candidateHeader, header)) {
          continue;
        }
        break;
      }
      if (isChapterLine(candidate) || isHeadingLike(candidate)) continue;
      if (isDefinitionCandidate(candidate)) {
        definition = candidate;
        break;
      }
    }

    terms.push({
      id: `F${String(terms.length + 1).padStart(3, "0")}`,
      chapter: currentChapter || "术语和定义",
      name_cn: header.name_cn,
      name_en: header.name_en,
      definition,
      has_definition: definition.length > 0
    });
  }

  return terms;
}

function finalizeTerm(draft: TermDraft | null): Term | null {
  if (!draft) {
    return null;
  }

  const definition = cleanText(draft.definitionParts.join(" "));
  return {
    id: draft.id,
    chapter: draft.chapter,
    name_cn: draft.name_cn,
    name_en: draft.name_en,
    definition,
    has_definition: definition.length > 0
  };
}

function linesFromHtml(html: string) {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const nodes = dom.querySelectorAll("p, h1, h2, h3, h4, li, td");
  const lines: string[] = [];
  nodes.forEach((node) => {
    const text = cleanText(node.textContent ?? "");
    if (text) {
      lines.push(text);
    }
  });
  return lines;
}

export function extractAuthorFromFileName(fileName: string) {
  const directMatch = KNOWN_AUTHORS.find((author) => fileName.includes(author));
  if (directMatch) {
    return directMatch;
  }

  const stem = fileName.replace(/\.[^.]+$/, "");
  const tokens = stem.split(/[-_（）()·\s]/).map((token) => token.trim()).filter(Boolean);

  if (tokens.length === 0) {
    return "未知作者";
  }

  return tokens[tokens.length - 1];
}

export async function parseDocx(file: File): Promise<ParsedDoc> {
  const arrayBuffer = await file.arrayBuffer();
  const input: { arrayBuffer: ArrayBuffer; buffer?: Uint8Array } = {
    arrayBuffer
  };
  if (typeof Buffer !== "undefined") {
    input.buffer = Buffer.from(arrayBuffer);
  }
  const result = await mammoth.convertToHtml(input as unknown as { arrayBuffer: ArrayBuffer });
  const lines = linesFromHtml(result.value);

  let currentChapter = "未分类";
  let currentTerm: TermDraft | null = null;
  const terms: Term[] = [];

  lines.forEach((line) => {
    if (isChapterLine(line)) {
      currentChapter = line;
      return;
    }

    if (isTermLine(line)) {
      const finalized = finalizeTerm(currentTerm);
      if (finalized) {
        terms.push(finalized);
      }

      const header = splitTermHeader(line);
      if (!header) {
        currentTerm = null;
        return;
      }

      currentTerm = {
        id: header.id,
        chapter: currentChapter,
        name_cn: header.name_cn,
        name_en: header.name_en,
        definitionParts: []
      };
      return;
    }

    if (currentTerm) {
      currentTerm.definitionParts.push(line);
    }
  });

  const finalized = finalizeTerm(currentTerm);
  if (finalized) {
    terms.push(finalized);
  }

  const normalizedTerms = terms.filter((term) => term.name_cn.trim().length > 0);
  const parsedTerms = normalizedTerms.length > 0 ? normalizedTerms : parseFallbackTerms(lines);

  return {
    id: crypto.randomUUID(),
    file_name: file.name,
    author: extractAuthorFromFileName(file.name),
    terms: parsedTerms,
    uploaded_at: new Date().toISOString()
  };
}
