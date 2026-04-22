"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type PropsWithChildren
} from "react";
import type { AppState } from "@/lib/types";
import { appReducer, initialState, type Action } from "@/store/reducer";

const REVIEW_STORAGE_KEY = "cfh_review_state_v3";

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    const raw = window.localStorage.getItem(REVIEW_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Pick<
        AppState,
        "merge_results" | "review_decisions"
      >;

      dispatch({
        type: "HYDRATE_REVIEW_STATE",
        payload: {
          merge_results: parsed.merge_results ?? {},
          review_decisions: parsed.review_decisions ?? {}
        }
      });
    } catch (error) {
      console.error("读取审阅进度失败，将忽略本地缓存。", error);
    }
  }, []);

  useEffect(() => {
    const payload = JSON.stringify({
      merge_results: state.merge_results,
      review_decisions: state.review_decisions
    });
    window.localStorage.setItem(REVIEW_STORAGE_KEY, payload);
  }, [state.merge_results, state.review_decisions]);

  const value = useMemo(
    () => ({
      state,
      dispatch
    }),
    [state]
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
