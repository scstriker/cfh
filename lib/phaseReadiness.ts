import type { AppState } from "@/lib/types";

export type PhaseNextAction =
  | "template"
  | "gold_standard"
  | "experts"
  | "term_units"
  | null;

export interface ReadinessState {
  ready: boolean;
  missing: string[];
  next_action: PhaseNextAction;
}

type ReadinessInput = Pick<
  AppState,
  "template_outline" | "gold_standard_status" | "parsed_docs" | "term_unit_status"
>;

export function getTermUnitReadiness(state: ReadinessInput): ReadinessState {
  const missing: string[] = [];
  let nextAction: PhaseNextAction = null;

  if (!state.template_outline) {
    missing.push("请先上传模板骨架。");
    nextAction = "template";
  } else if (state.gold_standard_status === "pending") {
    missing.push("请先完成术语金标准步骤（导入或跳过）。");
    nextAction = "gold_standard";
  } else if (state.parsed_docs.length === 0) {
    missing.push("请先上传并确认专家草稿。");
    nextAction = "experts";
  }

  return {
    ready: missing.length === 0,
    missing,
    next_action: nextAction
  };
}

export function getPhase2Readiness(state: ReadinessInput): ReadinessState {
  const termUnitReadiness = getTermUnitReadiness(state);
  if (!termUnitReadiness.ready) {
    return termUnitReadiness;
  }

  if (state.term_unit_status === "reviewed") {
    return {
      ready: true,
      missing: [],
      next_action: null
    };
  }

  return {
    ready: false,
    missing: [
      state.term_unit_status === "generated"
        ? "请先完成术语工作单元检查。"
        : "请先生成并检查术语工作单元。"
    ],
    next_action: "term_units"
  };
}
