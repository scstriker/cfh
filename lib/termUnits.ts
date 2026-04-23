import { normalizeDraftTermKey } from "@/lib/draftImport";
import { buildPreclusters, cnEditSimilarity } from "@/lib/precluster";
import type {
  ConceptCluster,
  GoldStandardEntry,
  ParsedDoc,
  TemplateOutline,
  TemplateTerm,
  Term
} from "@/lib/types";

const CHAPTER_RECOMMEND_THRESHOLD = 0.56;

export type TermUnitMemberAction = "keep" | "move_to_template" | "move_to_candidate";

export interface TermUnitMemberOverride {
  action: TermUnitMemberAction;
  template_term_id?: string;
}

export interface TermUnitCandidateDecision {
  action: "ignore" | "candidate" | "promote";
  chapter?: string;
}

export function buildTermUnitMemberKey(author: string, termId: string) {
  return `${author}::${termId}`;
}

function buildTemplateKeyIndex(templateOutline: TemplateOutline) {
  const index = new Map<string, TemplateTerm[]>();
  templateOutline.terms.forEach((term) => {
    const key = normalizeDraftTermKey(term.name_cn);
    const list = index.get(key) ?? [];
    list.push(term);
    index.set(key, list);
  });
  return index;
}

export function attachTemplateMappingsToParsedDocs(
  parsedDocs: ParsedDoc[],
  templateOutline: TemplateOutline
) {
  const keyIndex = buildTemplateKeyIndex(templateOutline);

  return parsedDocs.map((doc) => ({
    ...doc,
    terms: doc.terms.map((term) => {
      if (term.template_term_id) {
        return term;
      }

      const matches = keyIndex.get(normalizeDraftTermKey(term.name_cn)) ?? [];
      if (matches.length !== 1) {
        return term;
      }

      return {
        ...term,
        template_term_id: matches[0].template_term_id
      };
    })
  }));
}

export function applyTermUnitMemberOverrides(
  parsedDocs: ParsedDoc[],
  overrides: Record<string, TermUnitMemberOverride>
) {
  return parsedDocs.map((doc) => ({
    ...doc,
    terms: doc.terms.map((term) => {
      const override = overrides[buildTermUnitMemberKey(doc.author, term.id)];
      if (!override || override.action === "keep") {
        return term;
      }

      if (override.action === "move_to_candidate") {
        return {
          ...term,
          template_term_id: undefined
        };
      }

      if (override.action === "move_to_template" && override.template_term_id) {
        return {
          ...term,
          template_term_id: override.template_term_id
        };
      }

      return term;
    })
  }));
}

function recommendChapter(
  aliases: string[],
  templateOutline: TemplateOutline
): { chapter: string; reason: string; confidence?: number } {
  let best:
    | {
        chapter: string;
        templateName: string;
        score: number;
      }
    | undefined;

  aliases.forEach((alias) => {
    templateOutline.terms.forEach((term) => {
      const score = cnEditSimilarity(alias, term.name_cn);
      if (!best || score > best.score) {
        best = {
          chapter: term.chapter,
          templateName: term.name_cn,
          score
        };
      }
    });
  });

  if (!best || best.score < CHAPTER_RECOMMEND_THRESHOLD) {
    return {
      chapter: templateOutline.chapter_order[0] ?? "未分类",
      reason: "未找到高置信近名模板词，需人工确认挂载章节。"
    };
  }

  return {
    chapter: best.chapter,
    confidence: best.score,
    reason: `系统按近名模板词“${best.templateName}”推荐挂载到“${best.chapter}”。`
  };
}

function pickCanonicalName(terms: Array<{ name_cn: string; name_en: string }>) {
  const counts = new Map<string, { count: number; name_en: string }>();
  terms.forEach((term) => {
    const key = term.name_cn.trim();
    if (!key) {
      return;
    }
    const current = counts.get(key);
    counts.set(key, {
      count: (current?.count ?? 0) + 1,
      name_en: current?.name_en || term.name_en
    });
  });

  const sorted = Array.from(counts.entries()).sort((left, right) => {
    if (right[1].count !== left[1].count) {
      return right[1].count - left[1].count;
    }
    return left[0].length - right[0].length;
  });

  if (sorted.length === 0) {
    return { name_cn: "", name_en: "" };
  }

  return {
    name_cn: sorted[0][0],
    name_en: sorted[0][1].name_en
  };
}

function sortByTemplateOrder(
  clusters: ConceptCluster[],
  templateOutline: TemplateOutline
) {
  const templateIndex = new Map(
    templateOutline.terms.map((term, index) => [term.template_term_id, index])
  );

  return [...clusters].sort((left, right) => {
    const leftInTemplate = Boolean(left.template_term_id);
    const rightInTemplate = Boolean(right.template_term_id);
    if (leftInTemplate && rightInTemplate) {
      return (
        (templateIndex.get(left.template_term_id ?? "") ?? Number.MAX_SAFE_INTEGER) -
        (templateIndex.get(right.template_term_id ?? "") ?? Number.MAX_SAFE_INTEGER)
      );
    }
    if (leftInTemplate && !rightInTemplate) return -1;
    if (!leftInTemplate && rightInTemplate) return 1;
    return left.canonical_name_cn.localeCompare(right.canonical_name_cn, "zh-Hans-CN");
  });
}

export function buildAutomaticTermUnits(params: {
  parsedDocs: ParsedDoc[];
  templateOutline: TemplateOutline;
  goldStandardEntries?: GoldStandardEntry[];
}) {
  const { parsedDocs, templateOutline, goldStandardEntries = [] } = params;
  const goldStandardTemplateIds = new Set(
    goldStandardEntries.map((entry) => entry.template_term_id)
  );

  const clusters: ConceptCluster[] = templateOutline.terms.map((term) => ({
    cluster_id: `TU-${term.template_term_id}`,
    canonical_name_cn: term.name_cn,
    canonical_name_en: term.name_en,
    members: [],
    aliases: [],
    is_orphan: false,
    in_template_scope: true,
    template_term_id: term.template_term_id,
    gold_standard_term: goldStandardTemplateIds.has(term.template_term_id),
    include_in_scope: true,
    suggested_chapter: term.chapter,
    mounting_reason: ""
  }));

  const clusterByTemplateId = new Map(
    clusters.map((cluster) => [cluster.template_term_id, cluster] as const)
  );

  const unmatchedDocs: ParsedDoc[] = parsedDocs.map((doc) => ({
    ...doc,
    terms: []
  }));

  parsedDocs.forEach((doc, docIndex) => {
    doc.terms.forEach((term) => {
      if (term.template_term_id && clusterByTemplateId.has(term.template_term_id)) {
        const cluster = clusterByTemplateId.get(term.template_term_id)!;
        cluster.members.push({
          author: doc.author,
          term_id: term.id,
          term_name: term.name_cn
        });
        cluster.aliases = Array.from(
          new Set([...(cluster.aliases ?? []), term.name_cn].filter((value) => value.trim().length > 0))
        );
        return;
      }

      unmatchedDocs[docIndex].terms.push(term);
    });
  });

  const unmatchedDocsWithTerms = unmatchedDocs.filter((doc) => doc.terms.length > 0);
  if (unmatchedDocsWithTerms.length > 0) {
    const precluster = buildPreclusters(unmatchedDocsWithTerms);
    const termLookup = new Map<string, { doc: ParsedDoc; term: Term }>();
    unmatchedDocsWithTerms.forEach((doc) => {
      doc.terms.forEach((term) => {
        termLookup.set(`${doc.author}::${term.id}::${term.name_cn}`, { doc, term });
      });
    });

    precluster.groups.forEach((group) => {
      const resolved = group.member_keys
        .map((key) => termLookup.get(key))
        .filter((item): item is { doc: ParsedDoc; term: Term } => Boolean(item));

      if (resolved.length === 0) {
        return;
      }

      const aliases = Array.from(
        new Set(resolved.map((item) => item.term.name_cn).filter((value) => value.trim().length > 0))
      );
      const canonical = pickCanonicalName(
        resolved.map((item) => ({
          name_cn: item.term.name_cn,
          name_en: item.term.name_en
        }))
      );
      const recommendation = recommendChapter(aliases, templateOutline);

      clusters.push({
        cluster_id: `TU-${group.group_id}`,
        canonical_name_cn: canonical.name_cn,
        canonical_name_en: canonical.name_en,
        members: resolved.map((item) => ({
          author: item.doc.author,
          term_id: item.term.id,
          term_name: item.term.name_cn
        })),
        aliases,
        is_orphan: true,
        in_template_scope: false,
        template_term_id: undefined,
        gold_standard_term: false,
        confidence: recommendation.confidence,
        rationale: "模板外候选术语自动归组",
        include_in_scope: false,
        suggested_chapter: recommendation.chapter,
        mounting_reason: recommendation.reason
      });
    });
  }

  return sortByTemplateOrder(clusters, templateOutline);
}

export function finalizeTermUnits(
  autoUnits: ConceptCluster[],
  candidateDecisions: Record<string, TermUnitCandidateDecision>
) {
  return autoUnits.map((cluster) => {
    if (cluster.in_template_scope) {
      return {
        ...cluster,
        include_in_scope: true
      };
    }

    const decision = candidateDecisions[cluster.cluster_id];
    if (!decision || decision.action === "candidate") {
      return {
        ...cluster,
        include_in_scope: false,
        mounting_reason: cluster.mounting_reason || "保留为模板外候选术语。"
      };
    }

    if (decision.action === "ignore") {
      return {
        ...cluster,
        include_in_scope: false,
        mounting_reason: "阶段一人工忽略，不进入本轮正文范围。"
      };
    }

    return {
      ...cluster,
      include_in_scope: true,
      suggested_chapter: decision.chapter || cluster.suggested_chapter,
      mounting_reason:
        cluster.mounting_reason || "阶段一人工确认提升进正文范围。"
    };
  });
}
