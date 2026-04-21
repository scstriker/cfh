import type {
  AppState,
  ConceptCluster,
  MergeResult,
  ParsedDoc,
  PhaseId,
  ReviewDecision
} from "@/lib/types";

export const initialState: AppState = {
  parsed_docs: [],
  concept_clusters: [],
  merge_results: {},
  review_decisions: {},
  primary_author: "",
  api_key: "",
  current_phase: "phase1",
  phase0_locked: false
};

export type Action =
  | { type: "SET_API_KEY"; payload: string }
  | { type: "SET_PRIMARY_AUTHOR"; payload: string }
  | { type: "SET_CURRENT_PHASE"; payload: PhaseId }
  | { type: "SET_PHASE0_LOCKED"; payload: boolean }
  | { type: "SET_PARSED_DOCS"; payload: ParsedDoc[] }
  | { type: "UPSERT_PARSED_DOC"; payload: ParsedDoc }
  | { type: "SET_CONCEPT_CLUSTERS"; payload: ConceptCluster[] }
  | { type: "SET_MERGE_RESULTS"; payload: Record<string, MergeResult> }
  | { type: "UPSERT_MERGE_RESULT"; payload: MergeResult }
  | { type: "SET_REVIEW_DECISION"; payload: ReviewDecision }
  | {
      type: "HYDRATE_REVIEW_STATE";
      payload: {
        merge_results: Record<string, MergeResult>;
        review_decisions: Record<string, ReviewDecision>;
      };
    }
  | { type: "RESET_PROJECT" };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_API_KEY":
      return { ...state, api_key: action.payload };
    case "SET_PRIMARY_AUTHOR":
      return { ...state, primary_author: action.payload };
    case "SET_CURRENT_PHASE":
      return { ...state, current_phase: action.payload };
    case "SET_PHASE0_LOCKED":
      return { ...state, phase0_locked: action.payload };
    case "SET_PARSED_DOCS":
      return { ...state, parsed_docs: action.payload };
    case "UPSERT_PARSED_DOC": {
      const existingIndex = state.parsed_docs.findIndex(
        (doc) => doc.id === action.payload.id
      );

      if (existingIndex === -1) {
        return { ...state, parsed_docs: [...state.parsed_docs, action.payload] };
      }

      const nextDocs = [...state.parsed_docs];
      nextDocs[existingIndex] = action.payload;
      return { ...state, parsed_docs: nextDocs };
    }
    case "SET_CONCEPT_CLUSTERS":
      return { ...state, concept_clusters: action.payload };
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
    case "HYDRATE_REVIEW_STATE":
      return {
        ...state,
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
