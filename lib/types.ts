export type PhaseId = "phase0" | "phase1" | "phase2" | "phase3" | "phase4";
export const MAPPING_TYPES = ["exact", "close", "broad", "narrow", "related"] as const;
export type MappingType = (typeof MAPPING_TYPES)[number];
export const QUALITY_FLAGS = [
  "sentence_form",
  "logic_order",
  "circular_definition",
  "too_long",
  "clause_too_long",
  "abbreviation",
  "grammar"
] as const;
export type QualityFlag = (typeof QUALITY_FLAGS)[number];

export interface Term {
  id: string;
  chapter: string;
  name_cn: string;
  name_en: string;
  definition: string;
  has_definition: boolean;
}

export interface ParsedDoc {
  id: string;
  file_name: string;
  author: string;
  terms: Term[];
  uploaded_at: string;
}

export interface RawTermCandidate {
  id: string;
  chapter: string;
  raw_name_cn: string;
  raw_name_en: string;
  definition: string;
  has_definition: boolean;
}

export interface RawParsedDoc {
  id: string;
  file_name: string;
  author: string;
  terms: RawTermCandidate[];
  uploaded_at: string;
}

export const DRAFT_CLEANING_ISSUE_TYPES = [
  "header_concat",
  "template_normalization",
  "typo_or_particle",
  "post_clean_duplicate",
  "ambiguous_template_match"
] as const;
export type DraftCleaningIssueType = (typeof DRAFT_CLEANING_ISSUE_TYPES)[number];
export type DraftCleaningIssueStatus = "pending" | "resolved";
export type DraftCleaningSuggestedAction = "rename" | "drop" | "none";
export type DraftCleaningDecisionAction =
  | "accept_cleaning"
  | "keep_raw"
  | "manual_edit";

export interface DraftCleaningIssue {
  issue_id: string;
  author: string;
  file_name: string;
  raw_term_id: string;
  issue_type: DraftCleaningIssueType;
  raw_name_cn: string;
  raw_name_en: string;
  suggested_name_cn?: string;
  suggested_name_en?: string;
  template_term_id?: string;
  reason: string;
  confidence: number;
  blocking: boolean;
  status: DraftCleaningIssueStatus;
  suggested_action: DraftCleaningSuggestedAction;
  related_raw_term_ids?: string[];
}

export interface DraftCleaningDecision {
  issue_id: string;
  action: DraftCleaningDecisionAction;
  manual_name_cn?: string;
  manual_name_en?: string;
}

export interface PendingImportBatch {
  batch_id: string;
  created_at: string;
  raw_docs: RawParsedDoc[];
  base_issues: DraftCleaningIssue[];
}

export interface DraftCleaningSummary {
  doc_count: number;
  term_count: number;
  issue_count: number;
  blocking_issue_count: number;
  issue_counts: Record<DraftCleaningIssueType, number>;
  accepted_samples: Array<{
    author: string;
    raw_name_cn: string;
    cleaned_name_cn: string;
    action: DraftCleaningSuggestedAction;
  }>;
}

export interface TemplateDoc {
  id: string;
  file_name: string;
  uploaded_at: string;
}

export interface TemplateTerm {
  template_term_id: string;
  chapter: string;
  name_cn: string;
  name_en: string;
  existing_definition?: string;
}

export interface TemplateOutline {
  file_name: string;
  uploaded_at: string;
  chapter_order: string[];
  terms: TemplateTerm[];
}

export interface GoldStandardDoc {
  id: string;
  file_name: string;
  uploaded_at: string;
  source_kind: "csv" | "converter";
}

export interface GoldStandardEntry {
  template_term_id: string;
  chapter: string;
  term_name_cn: string;
  term_name_en: string;
  source_doc: string;
  source_excerpt: string;
  standard_definition: string;
  notes?: string;
  quality_flags: QualityFlag[];
  imported_at: string;
}

export interface GoldStandardImportRow {
  row_id: string;
  row_index: number;
  template_term_id?: string;
  chapter: string;
  term_name_cn: string;
  term_name_en: string;
  source_doc: string;
  source_excerpt: string;
  standard_definition: string;
  notes: string;
}

export const GOLD_STANDARD_IMPORT_ISSUE_TYPES = [
  "missing_template_term_id",
  "invalid_template_term_id",
  "name_match_review",
  "unmatched_template_term"
] as const;
export type GoldStandardImportIssueType =
  (typeof GOLD_STANDARD_IMPORT_ISSUE_TYPES)[number];
export type GoldStandardImportIssueStatus = "pending" | "resolved";
export type GoldStandardImportDecisionAction =
  | "accept_suggestion"
  | "manual_map"
  | "drop_row";

export interface GoldStandardImportIssue {
  issue_id: string;
  row_id: string;
  row_index: number;
  issue_type: GoldStandardImportIssueType;
  raw_template_term_id?: string;
  raw_term_name_cn: string;
  raw_term_name_en: string;
  suggested_template_term_id?: string;
  suggested_term_name_cn?: string;
  reason: string;
  blocking: boolean;
  status: GoldStandardImportIssueStatus;
}

export interface GoldStandardImportDecision {
  issue_id: string;
  action: GoldStandardImportDecisionAction;
  manual_template_term_id?: string;
}

export interface PendingGoldStandardImport {
  import_id: string;
  gold_standard_doc: GoldStandardDoc;
  rows: GoldStandardImportRow[];
  issues: GoldStandardImportIssue[];
}

export interface ConceptMember {
  author: string;
  term_id: string;
  term_name: string;
}

export interface ConceptCluster {
  cluster_id: string;
  canonical_name_cn: string;
  canonical_name_en: string;
  members: ConceptMember[];
  is_orphan: boolean;
  in_template_scope: boolean;
  template_term_id?: string;
  gold_standard_term?: boolean;
  confidence?: number;
  rationale?: string;
  mapping_type?: MappingType;
  aliases?: string[];
  include_in_scope?: boolean;
  suggested_chapter?: string;
  mounting_reason?: string;
}

export interface DimensionDescription {
  text: string;
  sources: string[];
}

export interface Dimension {
  label: string;
  descriptions: DimensionDescription[];
}

export interface Segment {
  text: string;
  source: string;
}

export interface MergeSourceEntry {
  author: string;
  term_id: string;
  term_name_cn: string;
  term_name_en: string;
  chapter: string;
  definition: string;
  has_definition: boolean;
}

export interface ExcludedSource {
  author: string;
  reason: string;
}

export type MergeStatus =
  | "pending"
  | "aligned"
  | "ai_merged"
  | "accepted"
  | "edited"
  | "deferred"
  | "ai_failed";

export type MergeDefinitionSource =
  | "gold_standard"
  | "expert_merge"
  | "single_expert"
  | "missing";

export interface MergeResult {
  cluster_id: string;
  template_term_id?: string;
  in_template_scope: boolean;
  definition_source: MergeDefinitionSource;
  term_name_cn: string;
  term_name_en: string;
  chapter: string;
  source_entries: MergeSourceEntry[];
  dimensions: Dimension[];
  merged_definition: string;
  segments: Segment[];
  notes: string;
  excluded_sources: ExcludedSource[];
  quality_flags: QualityFlag[];
  reference_items: string[];
  status: MergeStatus;
}

export type DecisionType =
  | "accept_gold_standard"
  | "accept_merge"
  | "accept_source_original"
  | "manual_edit"
  | "defer";

export interface ReviewDecision {
  cluster_id: string;
  decision: DecisionType;
  final_text: string;
  final_segments: Segment[];
  selected_source_author?: string;
  timestamp: string;
}

export interface AppState {
  parsed_docs: ParsedDoc[];
  template_doc: TemplateDoc | null;
  template_outline: TemplateOutline | null;
  gold_standard_doc: GoldStandardDoc | null;
  gold_standard_entries: GoldStandardEntry[];
  concept_clusters: ConceptCluster[];
  merge_results: Record<string, MergeResult>;
  review_decisions: Record<string, ReviewDecision>;
  api_key: string;
  current_phase: PhaseId;
  phase0_locked: boolean;
}
