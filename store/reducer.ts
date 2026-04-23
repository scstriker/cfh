import type {
  AppState,
  ConceptCluster,
  GoldStandardDoc,
  GoldStandardEntry,
  MergeResult,
  ParsedDoc,
  PhaseId,
  ReviewDecision,
  TemplateDoc,
  TemplateOutline
} from "@/lib/types";
import {
  attachTemplateMappingsToParsedDocs,
  buildAutomaticTermUnits
} from "@/lib/termUnits";

export const initialState: AppState = {
  parsed_docs: [],
  template_doc: null,
  template_outline: null,
  gold_standard_doc: null,
  gold_standard_entries: [],
  gold_standard_status: "pending",
  concept_clusters: [],
  term_unit_status: "pending",
  merge_results: {},
  review_decisions: {},
  api_key: "",
  current_phase: "phase1"
};

export type Action =
  | { type: "SET_API_KEY"; payload: string }
  | { type: "SET_CURRENT_PHASE"; payload: PhaseId }
  | { type: "SET_TERM_UNIT_STATUS"; payload: AppState["term_unit_status"] }
  | {
      type: "SET_TEMPLATE_DATA";
      payload: {
        template_doc: TemplateDoc;
        template_outline: TemplateOutline;
      } | null;
    }
  | {
      type: "SET_GOLD_STANDARD_DATA";
      payload: {
        gold_standard_doc: GoldStandardDoc;
        gold_standard_entries: GoldStandardEntry[];
      } | null;
    }
  | { type: "SET_GOLD_STANDARD_SKIPPED" }
  | { type: "SET_PARSED_DOCS"; payload: ParsedDoc[] }
  | { type: "UPSERT_PARSED_DOC"; payload: ParsedDoc }
  | { type: "SET_CONCEPT_CLUSTERS"; payload: ConceptCluster[] }
  | { type: "SET_MERGE_RESULTS"; payload: Record<string, MergeResult> }
  | { type: "UPSERT_MERGE_RESULT"; payload: MergeResult }
  | { type: "SET_REVIEW_DECISION"; payload: ReviewDecision }
  | {
      type: "HYDRATE_PROJECT_STATE";
      payload: Pick<
        AppState,
        | "template_doc"
        | "template_outline"
        | "gold_standard_doc"
        | "gold_standard_entries"
        | "gold_standard_status"
        | "parsed_docs"
        | "concept_clusters"
        | "term_unit_status"
        | "merge_results"
        | "review_decisions"
      >;
    }
  | { type: "RESET_PROJECT" };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_API_KEY":
      return { ...state, api_key: action.payload };
    case "SET_CURRENT_PHASE":
      return { ...state, current_phase: action.payload };
    case "SET_TERM_UNIT_STATUS":
      return { ...state, term_unit_status: action.payload };
    case "SET_TEMPLATE_DATA":
      return {
        ...state,
        parsed_docs: [],
        template_doc: action.payload?.template_doc ?? null,
        template_outline: action.payload?.template_outline ?? null,
        gold_standard_doc: null,
        gold_standard_entries: [],
        gold_standard_status: "pending",
        concept_clusters: [],
        term_unit_status: "pending",
        merge_results: {},
        review_decisions: {}
      };
    case "SET_GOLD_STANDARD_DATA": {
      const conceptClusters =
        action.payload && state.template_outline && state.parsed_docs.length > 0
          ? buildAutomaticTermUnits({
              parsedDocs: state.parsed_docs,
              templateOutline: state.template_outline,
              goldStandardEntries: action.payload.gold_standard_entries
            })
          : [];

      return {
        ...state,
        gold_standard_doc: action.payload?.gold_standard_doc ?? null,
        gold_standard_entries: action.payload?.gold_standard_entries ?? [],
        gold_standard_status: action.payload ? "imported" : "pending",
        concept_clusters: conceptClusters,
        term_unit_status: conceptClusters.length > 0 ? "generated" : "pending",
        merge_results: {},
        review_decisions: {}
      };
    }
    case "SET_GOLD_STANDARD_SKIPPED": {
      const conceptClusters =
        state.template_outline && state.parsed_docs.length > 0
          ? buildAutomaticTermUnits({
              parsedDocs: state.parsed_docs,
              templateOutline: state.template_outline,
              goldStandardEntries: []
            })
          : [];

      return {
        ...state,
        gold_standard_doc: null,
        gold_standard_entries: [],
        gold_standard_status: "skipped",
        concept_clusters: conceptClusters,
        term_unit_status: conceptClusters.length > 0 ? "generated" : "pending",
        merge_results: {},
        review_decisions: {}
      };
    }
    case "SET_PARSED_DOCS": {
      const parsedDocs =
        state.template_outline && action.payload.length > 0
          ? attachTemplateMappingsToParsedDocs(action.payload, state.template_outline)
          : action.payload;
      const conceptClusters =
        state.template_outline && parsedDocs.length > 0
          ? buildAutomaticTermUnits({
              parsedDocs,
              templateOutline: state.template_outline,
              goldStandardEntries: state.gold_standard_entries
            })
          : [];

      return {
        ...state,
        parsed_docs: parsedDocs,
        concept_clusters: conceptClusters,
        term_unit_status: conceptClusters.length > 0 ? "generated" : "pending",
        merge_results: {},
        review_decisions: {}
      };
    }
    case "UPSERT_PARSED_DOC": {
      const existingIndex = state.parsed_docs.findIndex(
        (doc) => doc.id === action.payload.id
      );

      if (existingIndex === -1) {
        const nextDocs =
          state.template_outline
            ? attachTemplateMappingsToParsedDocs(
                [...state.parsed_docs, action.payload],
                state.template_outline
              )
            : [...state.parsed_docs, action.payload];
        const conceptClusters =
          state.template_outline
            ? buildAutomaticTermUnits({
                parsedDocs: nextDocs,
                templateOutline: state.template_outline,
                goldStandardEntries: state.gold_standard_entries
              })
            : [];
        return {
          ...state,
          parsed_docs: nextDocs,
          concept_clusters: conceptClusters,
          term_unit_status: conceptClusters.length > 0 ? "generated" : "pending",
          merge_results: {},
          review_decisions: {}
        };
      }

      const nextDocs = [...state.parsed_docs];
      nextDocs[existingIndex] = action.payload;
      const mappedDocs =
        state.template_outline
          ? attachTemplateMappingsToParsedDocs(nextDocs, state.template_outline)
          : nextDocs;
      const conceptClusters =
        state.template_outline
          ? buildAutomaticTermUnits({
              parsedDocs: mappedDocs,
              templateOutline: state.template_outline,
              goldStandardEntries: state.gold_standard_entries
            })
          : [];
      return {
        ...state,
        parsed_docs: mappedDocs,
        concept_clusters: conceptClusters,
        term_unit_status: conceptClusters.length > 0 ? "generated" : "pending",
        merge_results: {},
        review_decisions: {}
      };
    }
    case "SET_CONCEPT_CLUSTERS":
      return {
        ...state,
        concept_clusters: action.payload,
        term_unit_status: action.payload.length > 0 ? state.term_unit_status : "pending",
        merge_results: {},
        review_decisions: {}
      };
    case "SET_MERGE_RESULTS":
      return { ...state, merge_results: action.payload };
    case "UPSERT_MERGE_RESULT":
      return {
        ...state,
        merge_results: {
          ...state.merge_results,
          [action.payload.cluster_id]: action.payload
        }
      };
    case "SET_REVIEW_DECISION":
      return {
        ...state,
        review_decisions: {
          ...state.review_decisions,
          [action.payload.cluster_id]: action.payload
        }
      };
    case "HYDRATE_PROJECT_STATE":
      return {
        ...state,
        template_doc: action.payload.template_doc,
        template_outline: action.payload.template_outline,
        gold_standard_doc: action.payload.gold_standard_doc,
        gold_standard_entries: action.payload.gold_standard_entries,
        gold_standard_status: action.payload.gold_standard_status,
        parsed_docs: action.payload.parsed_docs,
        concept_clusters: action.payload.concept_clusters,
        term_unit_status: action.payload.term_unit_status,
        merge_results: action.payload.merge_results,
        review_decisions: action.payload.review_decisions
      };
    case "RESET_PROJECT":
      return {
        ...initialState,
        api_key: state.api_key
      };
    default:
      return state;
  }
}
