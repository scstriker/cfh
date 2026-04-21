export type PhaseId = "phase0" | "phase1" | "phase2" | "phase3" | "phase4";
export const MAPPING_TYPES = ["exact", "close", "broad", "narrow", "related"] as const;
export type MappingType = (typeof MAPPING_TYPES)[number];

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

export type MergeStatus =
  | "pending"
  | "aligned"
  | "ai_merged"
  | "accepted"
  | "edited"
  | "deferred"
  | "ai_failed";

export interface MergeResult {
  cluster_id: string;
  term_name_cn: string;
  term_name_en: string;
  chapter: string;
  source_entries: MergeSourceEntry[];
  primary_term?: MergeSourceEntry;
  dimensions: Dimension[];
  merged_definition: string;
  segments: Segment[];
  notes: string;
  status: MergeStatus;
}

export type DecisionType =
  | "accept_merge"
  | "accept_primary"
  | "manual_edit"
  | "defer";

export interface ReviewDecision {
  cluster_id: string;
  decision: DecisionType;
  final_text: string;
  final_segments: Segment[];
  timestamp: string;
}

export interface AppState {
  parsed_docs: ParsedDoc[];
  concept_clusters: ConceptCluster[];
  merge_results: Record<string, MergeResult>;
  review_decisions: Record<string, ReviewDecision>;
  primary_author: string;
  api_key: string;
  current_phase: PhaseId;
  phase0_locked: boolean;
}
