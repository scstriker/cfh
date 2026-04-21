import type { ConceptCluster, ParsedDoc, Term } from "@/lib/types";
import { normalizeMappingType } from "@/lib/mappingType";

export type CoverageMark = "✔" | "○" | "—";

export interface ConceptCoverageRow {
  cluster_id: string;
  canonical_name_cn: string;
  canonical_name_en: string;
  aliases: string[];
  is_orphan: boolean;
  mapping_type?: ConceptCluster["mapping_type"];
  confidence?: number;
  member_count: number;
  marks: Record<string, CoverageMark>;
}

export interface TermPreviewRow {
  name: string;
  marks: Record<string, CoverageMark>;
}

function normalizeName(term: Term) {
  return term.name_cn.trim().replace(/\s+/g, "");
}

export function collectAuthors(docs: ParsedDoc[]) {
  const seen = new Set<string>();
  const authors: string[] = [];

  docs.forEach((doc) => {
    if (!seen.has(doc.author)) {
      seen.add(doc.author);
      authors.push(doc.author);
    }
  });

  return authors;
}

function buildTermIndex(docs: ParsedDoc[]) {
  const index = new Map<string, Term>();
  docs.forEach((doc) => {
    doc.terms.forEach((term) => {
      index.set(`${doc.author}::${term.id}`, term);
    });
  });
  return index;
}

function deriveAliases(cluster: ConceptCluster) {
  if (cluster.aliases && cluster.aliases.length > 0) {
    return cluster.aliases.filter((alias) => alias.trim().length > 0);
  }
  return Array.from(new Set(cluster.members.map((member) => member.term_name))).filter(
    (name) => name.trim().length > 0
  );
}

function resolveConceptMark(params: {
  author: string;
  cluster: ConceptCluster;
  termIndex: Map<string, Term>;
}): CoverageMark {
  const { author, cluster, termIndex } = params;
  const members = cluster.members.filter((member) => member.author === author);
  if (members.length === 0) {
    return "—";
  }

  for (const member of members) {
    const term = termIndex.get(`${author}::${member.term_id}`);
    if (term?.has_definition) {
      return "✔";
    }
  }

  return "○";
}

export function buildConceptCoverageRows(params: {
  docs: ParsedDoc[];
  conceptClusters: ConceptCluster[];
}) {
  const { docs, conceptClusters } = params;
  const authors = collectAuthors(docs);
  const termIndex = buildTermIndex(docs);

  const rows: ConceptCoverageRow[] = conceptClusters.map((cluster) => {
    const marks: Record<string, CoverageMark> = {};
    authors.forEach((author) => {
      marks[author] = resolveConceptMark({ author, cluster, termIndex });
    });

    return {
      cluster_id: cluster.cluster_id,
      canonical_name_cn: cluster.canonical_name_cn,
      canonical_name_en: cluster.canonical_name_en,
      aliases: deriveAliases(cluster),
      is_orphan: cluster.is_orphan,
      mapping_type: normalizeMappingType(cluster.mapping_type),
      confidence: cluster.confidence,
      member_count: cluster.members.length,
      marks
    };
  });

  return { authors, rows };
}

function mergeMark(current: CoverageMark | undefined, next: CoverageMark): CoverageMark {
  if (current === "✔" || next === "✔") return "✔";
  if (current === "○" || next === "○") return "○";
  return next;
}

export function buildTermPreviewRows(docs: ParsedDoc[]) {
  const authors = collectAuthors(docs);
  const rowMap = new Map<string, Record<string, CoverageMark>>();

  docs.forEach((doc) => {
    doc.terms.forEach((term) => {
      const key = normalizeName(term);
      const row = rowMap.get(key) ?? {};
      const nextMark: CoverageMark = term.has_definition ? "✔" : "○";
      row[doc.author] = mergeMark(row[doc.author], nextMark);
      rowMap.set(key, row);
    });
  });

  const rows: TermPreviewRow[] = Array.from(rowMap.entries())
    .map(([name, marks]) => ({ name, marks }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

  return { authors, rows };
}
