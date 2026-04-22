import type { QualityFlag } from "@/lib/types";

function normalizeComparable(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[-–—_/]/g, "");
}

function splitClauses(value: string) {
  return value
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function detectSentenceForm(mergedDefinition: string) {
  const text = mergedDefinition.trim();
  if (!text) {
    return true;
  }

  const terminatorMatches = text.match(/[。.!！？?!]/g) ?? [];
  const semicolonMatches = text.match(/[；;]/g) ?? [];
  return terminatorMatches.length === 1 && /[。.!！？?!]$/.test(text) && semicolonMatches.length === 0;
}

function detectTooLong(mergedDefinition: string) {
  return mergedDefinition.replace(/\s+/g, "").length > 150;
}

function detectCircularDefinition(
  termNameCn: string,
  termNameEn: string,
  mergedDefinition: string
) {
  const normalizedDefinition = normalizeComparable(mergedDefinition);
  const normalizedCn = normalizeComparable(termNameCn);
  const normalizedEn = normalizeComparable(termNameEn);

  if (normalizedCn && normalizedDefinition.includes(normalizedCn)) {
    return true;
  }
  if (normalizedEn && normalizedDefinition.includes(normalizedEn)) {
    return true;
  }
  return false;
}

function detectClauseTooLong(mergedDefinition: string) {
  return splitClauses(mergedDefinition).some(
    (clause) => clause.replace(/\s+/g, "").length > 30
  );
}

function detectAbbreviation(mergedDefinition: string) {
  return /\b[A-Z]{2,6}\b/.test(mergedDefinition);
}

function detectLogicOrder(mergedDefinition: string) {
  const text = mergedDefinition.replace(/\s+/g, "");
  const categoryMatches = [
    /(技术|工艺|过程|方法)/.test(text),
    /(设备|装备|系统|平台)/.test(text),
    /(服务)/.test(text),
    /(指标|评价)/.test(text)
  ].filter(Boolean).length;

  return categoryMatches >= 2;
}

function detectGrammar(mergedDefinition: string) {
  const text = mergedDefinition.replace(/\s+/g, "");
  if (!text) {
    return false;
  }

  if (text.length > 60 && !/[，,。.!！？?!]/.test(text)) {
    return true;
  }

  const repeatedChunk = text.match(/(.{4,12})\1/);
  return Boolean(repeatedChunk);
}

export function runQualityChecks(params: {
  termNameCn: string;
  termNameEn: string;
  mergedDefinition: string;
}) {
  const { termNameCn, termNameEn, mergedDefinition } = params;
  const flags: QualityFlag[] = [];

  if (!detectSentenceForm(mergedDefinition)) {
    flags.push("sentence_form");
  }
  if (detectLogicOrder(mergedDefinition)) {
    flags.push("logic_order");
  }
  if (detectCircularDefinition(termNameCn, termNameEn, mergedDefinition)) {
    flags.push("circular_definition");
  }
  if (detectTooLong(mergedDefinition)) {
    flags.push("too_long");
  }
  if (detectClauseTooLong(mergedDefinition)) {
    flags.push("clause_too_long");
  }
  if (detectAbbreviation(mergedDefinition)) {
    flags.push("abbreviation");
  }
  if (detectGrammar(mergedDefinition)) {
    flags.push("grammar");
  }

  return Array.from(new Set(flags));
}
