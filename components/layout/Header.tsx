"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { StepIndicator } from "@/components/layout/StepIndicator";
import { isCloudDeployTarget } from "@/lib/runtimeMode";
import { useAppContext } from "@/store/AppContext";

const phaseByPath: Record<string, "phase1" | "phase2" | "phase3" | "phase4"> = {
  "/phase1": "phase1",
  "/phase2": "phase2",
  "/phase3": "phase3",
  "/phase4": "phase4"
};

interface HeaderProps {
  pathname: string;
}

export function Header({ pathname }: HeaderProps) {
  const { state, dispatch } = useAppContext();
  const phase = useMemo(() => phaseByPath[pathname] ?? state.current_phase, [pathname, state.current_phase]);
  const cloudMode = isCloudDeployTarget();

  return (
    <header className="rounded-xl bg-cfh-panel p-4 shadow-panel">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-cfh-ink">原子级制造术语标准草案智能合并系统</h1>
            <Badge tone={cloudMode ? "success" : "neutral"}>
              {cloudMode ? "云端代理模式" : "本地直连模式"}
            </Badge>
          </div>
          <p className="text-sm text-cfh-muted">
            {cloudMode
              ? "Firebase Hosting 托管前端，Gemini 调用通过 Cloud Run 代理。"
              : "纯前端 Next.js 实现，按阶段推进导入、合并、审阅与导出。"}
          </p>
        </div>
        {cloudMode ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            云端构建已隐藏 Gemini API Key 输入，所有模型调用将自动走同源代理。
          </div>
        ) : (
          <label className="block text-sm text-cfh-muted">
            Gemini API Key
            <input
              className="mt-1 w-full min-w-64 rounded-md border border-slate-200 bg-white px-3 py-2 text-cfh-ink outline-none ring-cfh-accent focus:ring-2"
              value={state.api_key}
              onChange={(event) => dispatch({ type: "SET_API_KEY", payload: event.target.value })}
              placeholder="粘贴 API Key（仅内存）"
              type="password"
            />
          </label>
        )}
      </div>
      <StepIndicator currentPhase={phase} />
    </header>
  );
}
