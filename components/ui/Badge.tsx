import type { PropsWithChildren } from "react";

type Tone = "neutral" | "success" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-700"
};

interface BadgeProps {
  tone?: Tone;
}

export function Badge({ children, tone = "neutral" }: PropsWithChildren<BadgeProps>) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        toneClass[tone]
      ].join(" ")}
    >
      {children}
    </span>
  );
}
