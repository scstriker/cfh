"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type PropsWithChildren
} from "react";
import type { AppState } from "@/lib/types";
import { appReducer, initialState, type Action } from "@/store/reducer";

const PROJECT_STORAGE_KEY = "cfh_project_state_v4";
const API_KEY_STORAGE_KEY = "cfh_api_key_session_v1";

type PersistedProjectState = Pick<
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

interface AppContextValue {
  hydrated: boolean;
  state: AppState;
  dispatch: Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const skipNextProjectPersistRef = useRef(false);

  useEffect(() => {
    try {
      const rawProjectState = window.localStorage.getItem(PROJECT_STORAGE_KEY);
      if (rawProjectState) {
        skipNextProjectPersistRef.current = true;
        const parsedProjectState = JSON.parse(rawProjectState) as Partial<PersistedProjectState>;
        dispatch({
          type: "HYDRATE_PROJECT_STATE",
          payload: {
            template_doc: parsedProjectState.template_doc ?? null,
            template_outline: parsedProjectState.template_outline ?? null,
            gold_standard_doc: parsedProjectState.gold_standard_doc ?? null,
            gold_standard_entries: parsedProjectState.gold_standard_entries ?? [],
            gold_standard_status: parsedProjectState.gold_standard_status ?? "pending",
            parsed_docs: parsedProjectState.parsed_docs ?? [],
            concept_clusters: parsedProjectState.concept_clusters ?? [],
            term_unit_status: parsedProjectState.term_unit_status ?? "pending",
            merge_results: parsedProjectState.merge_results ?? {},
            review_decisions: parsedProjectState.review_decisions ?? {}
          }
        });
      }

      const sessionApiKey = window.sessionStorage.getItem(API_KEY_STORAGE_KEY);
      if (sessionApiKey) {
        dispatch({ type: "SET_API_KEY", payload: sessionApiKey });
      }
    } catch (error) {
      console.error("读取本地项目状态失败，将忽略缓存。", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (skipNextProjectPersistRef.current) {
      skipNextProjectPersistRef.current = false;
      return;
    }

    const payload = JSON.stringify({
      template_doc: state.template_doc,
      template_outline: state.template_outline,
      gold_standard_doc: state.gold_standard_doc,
      gold_standard_entries: state.gold_standard_entries,
      gold_standard_status: state.gold_standard_status,
      parsed_docs: state.parsed_docs,
      concept_clusters: state.concept_clusters,
      term_unit_status: state.term_unit_status,
      merge_results: state.merge_results,
      review_decisions: state.review_decisions
    } satisfies PersistedProjectState);

    window.localStorage.setItem(PROJECT_STORAGE_KEY, payload);
  }, [
    hydrated,
    state.template_doc,
    state.template_outline,
    state.gold_standard_doc,
    state.gold_standard_entries,
    state.gold_standard_status,
    state.parsed_docs,
    state.concept_clusters,
    state.term_unit_status,
    state.merge_results,
    state.review_decisions
  ]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (state.api_key.trim()) {
      window.sessionStorage.setItem(API_KEY_STORAGE_KEY, state.api_key);
      return;
    }

    window.sessionStorage.removeItem(API_KEY_STORAGE_KEY);
  }, [hydrated, state.api_key]);

  const value = useMemo(
    () => ({
      hydrated,
      state,
      dispatch
    }),
    [hydrated, state]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext 必须在 AppProvider 内部使用。");
  }
  return context;
}
