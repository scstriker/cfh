import { parseRawDocx } from "@/lib/parser";
import { cnEditSimilarity } from "@/lib/precluster";
import type {
  DraftCleaningDecision,
  DraftCleaningIssue,
  DraftCleaningIssueType,
  DraftCleaningSummary,
  ParsedDoc,
  PendingImportBatch,
  RawParsedDoc,
  RawTermCandidate,
  TemplateOutline
} from "@/lib/types";

const FUZZY_TEMPLATE_THRESHOLD = 0.88;
const FUZZY_TEMPLATE_DELTA = 0.08;

type DerivedTermState = {
  doc_id: string;
  file_name: string;
  author: string;
  term: RawTermCandidate;
  current_name_cn: string;
  current_name_en: string;
  dropped: boolean;
};

export interface PendingImportResolution {
  issues: DraftCleaningIssue[];
  cleaned_docs: ParsedDoc[];
  can_submit: boolean;
  summary: DraftCleaningSummary;
}

export interface CliDraftImportResult extends PendingImportResolution {
  blocking_issues: DraftCleaningIssue[];
  decisions: Record<string, DraftCleaningDecision>;
}

function cleanText(input: string) {
  return input.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

export function normalizeDraftTermKey(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）[\]【】\-–—_/;；,，.。:：]/g, "")
    .replace(/[的地得]/g, "");
}

function normalizeEnglishKey(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function emptyIssueCounts(): DraftCleaningSummary["issue_counts"] {
  return {
    header_concat: 0,
    template_normalization: 0,
    typo_or_particle: 0,
    post_clean_duplicate: 0,
    ambiguous_template_match: 0
  };
}

function buildBaseIssueId(docId: string, rawTermId: string) {
  return `base:${docId}::${rawTermId}`;
}

function buildDuplicateIssueId(docId: string, rawTermId: string) {
  return `dup:${docId}::${rawTermId}`;
}

function buildIssue(params: Omit<DraftCleaningIssue, "status">): DraftCleaningIssue {
  return {
    ...params,
    status: "pending"
  };
}

function findHeaderConcatIssue(
  rawDoc: RawParsedDoc,
  term: RawTermCandidate
): DraftCleaningIssue | null {
  const rawName = cleanText(term.raw_name_cn);
  const rawEn = normalizeEnglishKey(term.raw_name_en);
  if (!rawName || term.has_definition) {
    return null;
  }

  const sibling = rawDoc.terms.find((candidate) => {
    if (candidate.id === term.id) {
      return false;
    }
    const siblingName = cleanText(candidate.raw_name_cn);
    if (!siblingName || siblingName.length < 4 || rawName === siblingName) {
      return false;
    }
    if (!rawName.includes(siblingName)) {
      return false;
    }
    const siblingEn = normalizeEnglishKey(candidate.raw_name_en);
    return Boolean(rawEn) && rawEn === siblingEn;
  });

  if (!sibling) {
    return null;
  }

  return buildIssue({
    issue_id: buildBaseIssueId(rawDoc.id, term.id),
    author: rawDoc.author,
    file_name: rawDoc.file_name,
    raw_term_id: term.id,
    issue_type: "header_concat",
    raw_name_cn: term.raw_name_cn,
    raw_name_en: term.raw_name_en,
    reason: `疑似将“${sibling.raw_name_cn}”串接进术语头，且与另一条术语共用英文名。`,
    confidence: 0.98,
    blocking: false,
    suggested_action: "drop",
    related_raw_term_ids: [sibling.id]
  });
}

function findTemplateNormalizationIssue(
  rawDoc: RawParsedDoc,
  term: RawTermCandidate,
  templateOutline: TemplateOutline
): DraftCleaningIssue | null {
  const rawName = cleanText(term.raw_name_cn);
  if (!rawName) {
    return null;
  }

  const rawKey = normalizeDraftTermKey(rawName);
  if (!rawKey) {
    return null;
  }

  const exactMatches = templateOutline.terms.filter(
    (templateTerm) => normalizeDraftTermKey(templateTerm.name_cn) === rawKey
  );

  if (exactMatches.length === 1) {
    const [matched] = exactMatches;
    if (matched.name_cn === rawName) {
      return null;
    }

    return buildIssue({
      issue_id: buildBaseIssueId(rawDoc.id, term.id),
      author: rawDoc.author,
      file_name: rawDoc.file_name,
      raw_term_id: term.id,
      issue_type: "template_normalization",
      raw_name_cn: term.raw_name_cn,
      raw_name_en: term.raw_name_en,
      suggested_name_cn: matched.name_cn,
      suggested_name_en: matched.name_en,
      template_term_id: matched.template_term_id,
      reason: `与模板术语“${matched.name_cn}”在标准化 key 上唯一一致，建议统一到模板标准写法。`,
      confidence: 0.99,
      blocking: false,
      suggested_action: "rename"
    });
  }

  if (exactMatches.length > 1) {
    return buildIssue({
      issue_id: buildBaseIssueId(rawDoc.id, term.id),
      author: rawDoc.author,
      file_name: rawDoc.file_name,
      raw_term_id: term.id,
      issue_type: "ambiguous_template_match",
      raw_name_cn: term.raw_name_cn,
      raw_name_en: term.raw_name_en,
      reason: `该术语标准化后可对应多个模板词，请人工确认。候选：${exactMatches
        .map((candidate) => candidate.name_cn)
        .join(" / ")}`,
      confidence: 0.85,
      blocking: true,
      suggested_action: "none"
    });
  }

  const rawKeyLength = rawKey.length;
  const candidates = templateOutline.terms
    .map((templateTerm) => ({
      templateTerm,
      score: cnEditSimilarity(rawName, templateTerm.name_cn),
      keyLength: normalizeDraftTermKey(templateTerm.name_cn).length
    }))
    .filter(
      (candidate) =>
        candidate.score >= FUZZY_TEMPLATE_THRESHOLD &&
        Math.abs(candidate.keyLength - rawKeyLength) <= 1
    )
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return null;
  }

  const [top, second] = candidates;
  if (second && top.score - second.score < FUZZY_TEMPLATE_DELTA) {
    return buildIssue({
      issue_id: buildBaseIssueId(rawDoc.id, term.id),
      author: rawDoc.author,
      file_name: rawDoc.file_name,
      raw_term_id: term.id,
      issue_type: "ambiguous_template_match",
      raw_name_cn: term.raw_name_cn,
      raw_name_en: term.raw_name_en,
      reason: `该术语与多个模板词接近，无法唯一归一。候选：${candidates
        .slice(0, 3)
        .map((candidate) => `${candidate.templateTerm.name_cn}(${candidate.score.toFixed(2)})`)
        .join(" / ")}`,
      confidence: top.score,
      blocking: true,
      suggested_action: "none"
    });
  }

  if (top.templateTerm.name_cn === rawName) {
    return null;
  }

  return buildIssue({
    issue_id: buildBaseIssueId(rawDoc.id, term.id),
    author: rawDoc.author,
    file_name: rawDoc.file_name,
    raw_term_id: term.id,
    issue_type: "typo_or_particle",
    raw_name_cn: term.raw_name_cn,
    raw_name_en: term.raw_name_en,
    suggested_name_cn: top.templateTerm.name_cn,
    suggested_name_en: top.templateTerm.name_en,
    template_term_id: top.templateTerm.template_term_id,
    reason: `该术语与模板词“${top.templateTerm.name_cn}”高度相近，建议统一标准写法。`,
    confidence: top.score,
    blocking: false,
    suggested_action: "rename"
  });
}

function buildBaseIssueForTerm(
  rawDoc: RawParsedDoc,
  term: RawTermCandidate,
  templateOutline: TemplateOutline
) {
  return (
    findHeaderConcatIssue(rawDoc, term) ??
    findTemplateNormalizationIssue(rawDoc, term, templateOutline)
  );
}

function createDerivedState(rawDoc: RawParsedDoc, term: RawTermCandidate): DerivedTermState {
  return {
    doc_id: rawDoc.id,
    file_name: rawDoc.file_name,
    author: rawDoc.author,
    term,
    current_name_cn: term.raw_name_cn,
    current_name_en: term.raw_name_en,
    dropped: false
  };
}

function applyManualDecision(
  state: DerivedTermState,
  decision: DraftCleaningDecision,
  fallbackNameCn: string,
  fallbackNameEn: string
) {
  state.current_name_cn = cleanText(decision.manual_name_cn || fallbackNameCn);
  state.current_name_en = cleanText(decision.manual_name_en || fallbackNameEn);
  state.dropped = false;
}

function applyBaseDecision(
  state: DerivedTermState,
  issue: DraftCleaningIssue,
  decision: DraftCleaningDecision | undefined
) {
  if (!decision) {
    return;
  }

  if (decision.action === "keep_raw") {
    state.current_name_cn = state.term.raw_name_cn;
    state.current_name_en = state.term.raw_name_en;
    state.dropped = false;
    return;
  }

  if (decision.action === "manual_edit") {
    applyManualDecision(state, decision, state.term.raw_name_cn, state.term.raw_name_en);
    return;
  }

  if (issue.suggested_action === "drop") {
    state.dropped = true;
    return;
  }

  if (issue.suggested_action === "rename") {
    state.current_name_cn = issue.suggested_name_cn ?? state.term.raw_name_cn;
    state.current_name_en = issue.suggested_name_en ?? state.term.raw_name_en;
    state.dropped = false;
  }
}

function applyDuplicateDecision(
  state: DerivedTermState,
  decision: DraftCleaningDecision | undefined
) {
  if (!decision) {
    return;
  }

  if (decision.action === "keep_raw") {
    state.current_name_cn = state.term.raw_name_cn;
    state.current_name_en = state.term.raw_name_en;
    state.dropped = false;
    return;
  }

  if (decision.action === "manual_edit") {
    applyManualDecision(state, decision, state.current_name_cn, state.current_name_en);
  }
}

function buildDuplicateIssues(states: DerivedTermState[]) {
  const groups = new Map<string, DerivedTermState[]>();

  states.forEach((state) => {
    if (state.dropped) {
      return;
    }
    const key = `${state.doc_id}::${normalizeDraftTermKey(state.current_name_cn)}`;
    if (!normalizeDraftTermKey(state.current_name_cn)) {
      return;
    }
    const list = groups.get(key) ?? [];
    list.push(state);
    groups.set(key, list);
  });

  const issues: DraftCleaningIssue[] = [];
  groups.forEach((members) => {
    if (members.length <= 1) {
      return;
    }
    members.forEach((member) => {
      const related = members.filter((candidate) => candidate.term.id !== member.term.id);
      issues.push(
        buildIssue({
          issue_id: buildDuplicateIssueId(member.doc_id, member.term.id),
          author: member.author,
          file_name: member.file_name,
          raw_term_id: member.term.id,
          issue_type: "post_clean_duplicate",
          raw_name_cn: member.term.raw_name_cn,
          raw_name_en: member.term.raw_name_en,
          reason: `清洗后与同一专家稿中的术语重名：${related
            .map((candidate) => candidate.current_name_cn)
            .join(" / ")}。请保留原词或手动改名。`,
          confidence: 1,
          blocking: true,
          suggested_action: "none",
          related_raw_term_ids: related.map((candidate) => candidate.term.id)
        })
      );
    });
  });

  return issues;
}

function buildParsedDocs(rawDocs: RawParsedDoc[], states: DerivedTermState[]): ParsedDoc[] {
  const stateByKey = new Map<string, DerivedTermState>(
    states.map((state) => [`${state.doc_id}::${state.term.id}`, state] as const)
  );

  return rawDocs.map((rawDoc) => ({
    id: rawDoc.id,
    file_name: rawDoc.file_name,
    author: rawDoc.author,
    uploaded_at: rawDoc.uploaded_at,
    terms: rawDoc.terms
      .map((term) => stateByKey.get(`${rawDoc.id}::${term.id}`))
      .filter((state): state is DerivedTermState => Boolean(state && !state.dropped))
      .map((state) => ({
        id: state.term.id,
        chapter: state.term.chapter,
        name_cn: cleanText(state.current_name_cn) || state.term.raw_name_cn,
        name_en: cleanText(state.current_name_en),
        definition: state.term.definition,
        has_definition: state.term.has_definition
      }))
  }));
}

function buildSummary(
  rawDocs: RawParsedDoc[],
  issues: DraftCleaningIssue[],
  baseIssues: DraftCleaningIssue[],
  decisions: Record<string, DraftCleaningDecision>
): DraftCleaningSummary {
  const issueCounts = emptyIssueCounts();
  issues.forEach((issue) => {
    issueCounts[issue.issue_type] += 1;
  });

  const acceptedSamples = baseIssues
    .filter(
      (issue) =>
        decisions[issue.issue_id]?.action === "accept_cleaning" &&
        (issue.suggested_action === "drop" || issue.suggested_name_cn !== issue.raw_name_cn)
    )
    .slice(0, 6)
    .map((issue) => ({
      author: issue.author,
      raw_name_cn: issue.raw_name_cn,
      cleaned_name_cn:
        issue.suggested_action === "drop"
          ? "（忽略该伪词条）"
          : issue.suggested_name_cn ?? issue.raw_name_cn,
      action: issue.suggested_action
    }));

  return {
    doc_count: rawDocs.length,
    term_count: rawDocs.reduce((sum, doc) => sum + doc.terms.length, 0),
    issue_count: issues.length,
    blocking_issue_count: issues.filter((issue) => issue.blocking).length,
    issue_counts: issueCounts,
    accepted_samples: acceptedSamples
  };
}

export async function buildPendingImportBatch(
  files: File[],
  templateOutline: TemplateOutline
): Promise<PendingImportBatch> {
  const rawDocs = await Promise.all(files.map((file) => parseRawDocx(file)));
  const baseIssues: DraftCleaningIssue[] = [];

  rawDocs.forEach((rawDoc) => {
    rawDoc.terms.forEach((term) => {
      const issue = buildBaseIssueForTerm(rawDoc, term, templateOutline);
      if (issue) {
        baseIssues.push(issue);
      }
    });
  });

  return {
    batch_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    raw_docs: rawDocs,
    base_issues: baseIssues
  };
}

export function resolvePendingImportBatch(
  batch: PendingImportBatch,
  decisions: Record<string, DraftCleaningDecision>
): PendingImportResolution {
  const baseIssuesByKey = new Map<string, DraftCleaningIssue>(
    batch.base_issues.map((issue) => [`${issue.author}::${issue.file_name}::${issue.raw_term_id}`, issue] as const)
  );

  const states = batch.raw_docs.flatMap((rawDoc) =>
    rawDoc.terms.map((term) => {
      const state = createDerivedState(rawDoc, term);
      const issue = baseIssuesByKey.get(`${rawDoc.author}::${rawDoc.file_name}::${term.id}`);
      if (issue) {
        applyBaseDecision(state, issue, decisions[issue.issue_id]);
      }
      return state;
    })
  );

  const stateByKey = new Map<string, DerivedTermState>(
    states.map((state) => [`${state.doc_id}::${state.term.id}`, state] as const)
  );

  Object.values(decisions).forEach((decision) => {
    if (!decision.issue_id.startsWith("dup:")) {
      return;
    }
    const rawKey = decision.issue_id.replace(/^dup:/, "");
    const state = stateByKey.get(rawKey);
    if (!state) {
      return;
    }
    applyDuplicateDecision(state, decision);
  });

  const duplicateIssues = buildDuplicateIssues(states);
  const issues: DraftCleaningIssue[] = [
    ...batch.base_issues.map((issue): DraftCleaningIssue => ({
      ...issue,
      status: decisions[issue.issue_id] ? "resolved" : "pending"
    })),
    ...duplicateIssues
  ];

  const cleanedDocs = buildParsedDocs(batch.raw_docs, states);
  const unresolvedBaseIssueCount = batch.base_issues.filter((issue) => !decisions[issue.issue_id]).length;
  const canSubmit = unresolvedBaseIssueCount === 0 && duplicateIssues.length === 0;

  return {
    issues,
    cleaned_docs: cleanedDocs,
    can_submit: canSubmit,
    summary: buildSummary(batch.raw_docs, issues, batch.base_issues, decisions)
  };
}

export async function autoResolvePendingImportBatchForCli(
  files: File[],
  templateOutline: TemplateOutline
): Promise<CliDraftImportResult> {
  const batch = await buildPendingImportBatch(files, templateOutline);
  const decisions: Record<string, DraftCleaningDecision> = {};

  batch.base_issues.forEach((issue) => {
    if (issue.suggested_action === "rename" || issue.suggested_action === "drop") {
      decisions[issue.issue_id] = {
        issue_id: issue.issue_id,
        action: "accept_cleaning"
      };
    }
  });

  const resolution = resolvePendingImportBatch(batch, decisions);
  const blockingIssues = resolution.issues.filter(
    (issue) => issue.blocking && issue.status !== "resolved"
  );

  return {
    ...resolution,
    blocking_issues: blockingIssues,
    decisions
  };
}
