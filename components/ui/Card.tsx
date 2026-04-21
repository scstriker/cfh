import type { PropsWithChildren } from "react";

interface CardProps {
  className?: string;
  title?: string;
}

export function Card({ children, className = "", title }: PropsWithChildren<CardProps>) {
  return (
    <section className={["rounded-xl bg-cfh-panel p-4 shadow-panel", className].join(" ")}>
      {title ? <h3 className="mb-3 text-base font-semibold text-cfh-ink">{title}</h3> : null}
      {children}
    </section>
  );
}
