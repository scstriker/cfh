import type { PhaseId } from "@/lib/types";

const steps: Array<{ id: PhaseId; label: string }> = [
  { id: "phase1", label: "阶段一 解析" },
  { id: "phase2", label: "阶段二 合并" },
  { id: "phase3", label: "阶段三 审阅" },
  { id: "phase4", label: "阶段四 导出" }
];

interface StepIndicatorProps {
  currentPhase: PhaseId;
}

export function StepIndicator({ currentPhase }: StepIndicatorProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentPhase);

  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((step, index) => {
        const completed = index < currentIndex;
        const active = index === currentIndex;

        return (
          <div
            key={step.id}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium",
              active ? "bg-cfh-accent text-white" : "",
              completed ? "bg-emerald-100 text-emerald-700" : "",
              !active && !completed ? "bg-slate-100 text-slate-600" : ""
            ].join(" ")}
          >
            {step.label}
          </div>
        );
      })}
    </div>
  );
}
