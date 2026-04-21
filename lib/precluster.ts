import type { ParsedDoc } from "@/lib/types";

export type SimilarityMethod = "cn_edit_distance" | "en_token_overlap" | "rule_mix";

export interface PreclusterTerm {
  term_key: string;
  author: string;
  term_id: string;
  name_cn: string;
  name_en: string;
  chapter: string;
}

export interface PreclusterCandidate {
  left_term_key: string;
  right_term_key: string;
  left_term_name: string;
  right_term_name: string;
  score: number;
  methods: SimilarityMethod[];
  cn_similarity: number;
  en_similarity: number;
  reason: string;
}

export interface PreclusterGroup {
  group_id: string;
  member_keys: string[];
  aliases: string[];
}

export interface PreclusterResult {
  terms: PreclusterTerm[];
  candidates: PreclusterCandidate[];
  groups: PreclusterGroup[];
  stats: {
    term_count: number;
    candidate_count: number;
    group_count: number;
  };
}

export interface PreclusterOptions {
  cnSimilarityThreshold: number;
  enOverlapThreshold: number;
  groupEdgeScoreThreshold: number;
  mixCnThreshold: number;
  mixEnThreshold: number;
}

const DEFAULT_OPTIONS: PreclusterOptions = {
  cnSimilarityThreshold: 0.72,
  enOverlapThreshold: 0.6,
  groupEdgeScoreThreshold: 0.72,
  mixCnThreshold: 0.56,
  mixEnThreshold: 0.36
};

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function normalizeCnText(value: string) {
  if (!value) return "";
  return value
    .trim()
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

export function tokenizeEn(value: string) {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

export function cnEditSimilarity(nameA: string, nameB: string) {
  const a = normalizeCnText(nameA);
  const b = normalizeCnText(nameB);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const short = a.length <= b.length ? a : b;
  const long = a.length > b.length ? a : b;
  if (short.length >= 3 && long.includes(short)) {
    return clamp01(short.length / long.length + 0.35);
  }

  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return clamp01(1 - distance / maxLen);
}

export function enTokenJaccard(nameA: string, nameB: string) {
  const setA = new Set(tokenizeEn(nameA));
  const setB = new Set(tokenizeEn(nameB));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) {
      intersection += 1;
    }
  });

  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return clamp01(intersection / union);
}

function buildTerms(parsedDocs: ParsedDoc[]) {
  const terms: PreclusterTerm[] = [];

  parsedDocs.forEach((doc) => {
    doc.terms.forEach((term) => {
      terms.push({
        term_key: `${doc.author}::${term.id}::${term.name_cn}`,
        author: doc.author,
        term_id: term.id,
        name_cn: term.name_cn,
        name_en: term.name_en,
        chapter: term.chapter
      });
    });
  });

  return terms;
}

function evaluatePair(
  left: PreclusterTerm,
  right: PreclusterTerm,
  options: PreclusterOptions
): PreclusterCandidate | null {
  const cn = cnEditSimilarity(left.name_cn, right.name_cn);
  const en = enTokenJaccard(left.name_en, right.name_en);
  const methods: SimilarityMethod[] = [];

  if (cn >= options.cnSimilarityThreshold) {
    methods.push("cn_edit_distance");
  }
  if (en >= options.enOverlapThreshold) {
    methods.push("en_token_overlap");
  }
  if (cn >= options.mixCnThreshold && en >= options.mixEnThreshold) {
    methods.push("rule_mix");
  }

  if (methods.length === 0) {
    return null;
  }

  const score = clamp01(Math.max(cn, en, cn * 0.7 + en * 0.3));
  return {
    left_term_key: left.term_key,
    right_term_key: right.term_key,
    left_term_name: left.name_cn,
    right_term_name: right.name_cn,
    score,
    methods,
    cn_similarity: cn,
    en_similarity: en,
    reason: `CN=${cn.toFixed(2)}, EN=${en.toFixed(2)}, methods=${methods.join("+")}`
  };
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  add(node: string) {
    if (!this.parent.has(node)) {
      this.parent.set(node, node);
    }
  }

  find(node: string): string {
    const p = this.parent.get(node);
    if (!p) {
      this.parent.set(node, node);
      return node;
    }
    if (p === node) {
      return p;
    }
    const root = this.find(p);
    this.parent.set(node, root);
    return root;
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootB, rootA);
    }
  }
}

function buildGroups(
  terms: PreclusterTerm[],
  candidates: PreclusterCandidate[],
  options: PreclusterOptions
) {
  const uf = new UnionFind();
  terms.forEach((term) => uf.add(term.term_key));

  candidates.forEach((candidate) => {
    if (candidate.score >= options.groupEdgeScoreThreshold) {
      uf.union(candidate.left_term_key, candidate.right_term_key);
    }
  });

  const bucket = new Map<string, PreclusterTerm[]>();
  terms.forEach((term) => {
    const root = uf.find(term.term_key);
    const list = bucket.get(root) ?? [];
    list.push(term);
    bucket.set(root, list);
  });

  return Array.from(bucket.values())
    .map((members, index) => ({
      group_id: `P${String(index + 1).padStart(3, "0")}`,
      member_keys: members.map((member) => member.term_key),
      aliases: Array.from(
        new Set(
          members
            .map((member) => member.name_cn.trim())
            .filter((name) => name.length > 0)
        )
      )
    }))
    .sort((a, b) => a.group_id.localeCompare(b.group_id));
}

export function buildPreclusters(
  parsedDocs: ParsedDoc[],
  partialOptions: Partial<PreclusterOptions> = {}
): PreclusterResult {
  const options = { ...DEFAULT_OPTIONS, ...partialOptions };
  const terms = buildTerms(parsedDocs);
  const candidates: PreclusterCandidate[] = [];

  for (let i = 0; i < terms.length; i += 1) {
    for (let j = i + 1; j < terms.length; j += 1) {
      const candidate = evaluatePair(terms[i], terms[j], options);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const groups = buildGroups(terms, candidates, options);

  return {
    terms,
    candidates,
    groups,
    stats: {
      term_count: terms.length,
      candidate_count: candidates.length,
      group_count: groups.length
    }
  };
}

export function formatPreclusterSummary(result: PreclusterResult) {
  const topCandidates = result.candidates
    .slice(0, 10)
    .map(
      (candidate) =>
        `${candidate.left_term_name} <> ${candidate.right_term_name} (${candidate.score.toFixed(
          2
        )}, ${candidate.methods.join("+")})`
    );

  return [
    `Precluster: terms=${result.stats.term_count}, candidates=${result.stats.candidate_count}, groups=${result.stats.group_count}`,
    ...topCandidates
  ].join("\n");
}
