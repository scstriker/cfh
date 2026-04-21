"use client";

import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  primary: "bg-cfh-accent text-white hover:opacity-90",
  secondary: "bg-cfh-panel text-cfh-ink ring-1 ring-cfh-ink/15 hover:bg-cfh-bg",
  ghost: "bg-transparent text-cfh-ink hover:bg-cfh-bg",
  danger: "bg-rose-600 text-white hover:bg-rose-700"
};

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variantClass[variant],
        className
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
